// SPDX-License-Identifier: Apache-2.0
use pyo3::exceptions::{PyRuntimeError, PyValueError};
use pyo3::prelude::*;
use pyo3::pybacked::PyBackedStr;
use pyo3::types::{PyDict, PyTuple};
use readability_core::{Article, Engine, Error, ExtractOptions, ReaderableOptions};

fn core_error(error: Error) -> PyErr {
    match error {
        Error::InvalidUrl
        | Error::InvalidOptions
        | Error::InvalidThreshold
        | Error::InvalidReaderableMinScore => PyValueError::new_err(error.to_string()),
        _ => PyRuntimeError::new_err(error.to_string()),
    }
}

macro_rules! field {
    ($options:expr, $name:literal) => {
        $options
            .get_item($name)?
            .ok_or_else(|| PyValueError::new_err(concat!("Missing ", $name)))?
            .extract()?
    };
}

fn engine(value: &str) -> PyResult<Engine> {
    match value {
        "chromium" => Ok(Engine::Chromium),
        "mozilla" => Ok(Engine::Mozilla),
        _ => Err(PyValueError::new_err(
            "engine must be \"chromium\" or \"mozilla\".",
        )),
    }
}

fn direct_options(options: &Bound<'_, PyDict>) -> PyResult<ExtractOptions> {
    let selected: String = field!(options, "engine");
    let density: f64 = field!(options, "linkDensityModifier");
    Ok(ExtractOptions {
        url: Some(field!(options, "url")),
        engine: engine(&selected)?,
        char_threshold: field!(options, "charThreshold"),
        max_elems_to_parse: field!(options, "maxElemsToParse"),
        nb_top_candidates: field!(options, "nbTopCandidates"),
        keep_classes: field!(options, "keepClasses"),
        classes_to_preserve: field!(options, "classesToPreserve"),
        disable_json_ld: field!(options, "disableJSONLD"),
        link_density_modifier: density as f32,
        sanitize: field!(options, "sanitize"),
        ..ExtractOptions::default()
    })
}

fn article_fields(py: Python<'_>, article: Option<Article>) -> PyResult<Option<Py<PyTuple>>> {
    article
        .map(|a| {
            let selected = match a.engine {
                Engine::Chromium => "chromium",
                Engine::Mozilla => "mozilla",
            };
            (
                a.title,
                a.content,
                a.text_content,
                a.length,
                a.url,
                selected,
                a.byline,
                a.dir,
                a.lang,
                a.excerpt,
                a.site_name,
                a.published_time,
            )
                .into_pyobject(py)
                .map(Bound::unbind)
        })
        .transpose()
}

#[pyfunction]
fn validate_text(_value: PyBackedStr) {}

#[pyfunction]
fn extract_article(
    py: Python<'_>,
    html: PyBackedStr,
    options: &Bound<'_, PyDict>,
) -> PyResult<Option<Py<PyTuple>>> {
    let options = direct_options(options)?;
    // PyBackedStr keeps immutable Python storage alive across detach, without
    // copying the complete HTML into an owned Rust String on every call.
    let article = py
        .detach(|| readability_core::extract_html(&html, &options))
        .map_err(core_error)?;
    article_fields(py, article)
}

#[pyfunction]
fn readerable_direct(
    py: Python<'_>,
    html: PyBackedStr,
    options: &Bound<'_, PyDict>,
) -> PyResult<bool> {
    let selected: String = field!(options, "engine");
    let score: f64 = field!(options, "minScore");
    let options = ReaderableOptions {
        engine: engine(&selected)?,
        min_content_length: field!(options, "minContentLength"),
        min_score: score.min(f32::MAX as f64) as f32,
        ..ReaderableOptions::default()
    };
    py.detach(|| readability_core::is_probably_readerable(&html, &options))
        .map_err(core_error)
}

// Separate clocks for diagnostics; the public direct path above is uninstrumented.
#[pyfunction]
fn profile_extract_article(
    py: Python<'_>,
    html: PyBackedStr,
    options: &Bound<'_, PyDict>,
) -> PyResult<(Option<Py<PyTuple>>, u64, u64, u64)> {
    let start = std::time::Instant::now();
    let options = direct_options(options)?;
    let decoded = start.elapsed().as_nanos() as u64;
    let start = std::time::Instant::now();
    let article = py
        .detach(|| readability_core::extract_html(&html, &options))
        .map_err(core_error)?;
    let extracted = start.elapsed().as_nanos() as u64;
    let start = std::time::Instant::now();
    let fields = article_fields(py, article)?;
    let converted = start.elapsed().as_nanos() as u64;
    Ok((fields, decoded, extracted, converted))
}

// Legacy private JSON adapters remain available for compatibility diagnostics.
// Own the inputs before detaching: no Python objects or shared DOM cross into
// extraction. JSON is limited to options and results; HTML travels separately.
#[pyfunction]
fn extract_json(py: Python<'_>, html: String, options: String) -> PyResult<String> {
    let value = serde_json::from_str(&options).map_err(|e| PyValueError::new_err(e.to_string()))?;
    let options = readability_core::boundary::decode_extract_options(&value, true)
        .map_err(PyValueError::new_err)?;
    let article = py
        .detach(|| readability_core::extract_html(&html, &options))
        .map_err(|e| PyRuntimeError::new_err(e.to_string()))?;
    serde_json::to_string(&article).map_err(|e| PyRuntimeError::new_err(e.to_string()))
}

#[pyfunction]
fn readerable(py: Python<'_>, html: String, options: String) -> PyResult<bool> {
    let value = serde_json::from_str(&options).map_err(|e| PyValueError::new_err(e.to_string()))?;
    let options =
        readability_core::boundary::readerable_options(&value).map_err(PyValueError::new_err)?;
    py.detach(|| readability_core::is_probably_readerable(&html, &options))
        .map_err(|e| PyRuntimeError::new_err(e.to_string()))
}

// Private test transport. Public Python API never exposes raw extraction.
#[pyfunction]
fn compatibility_request(py: Python<'_>, request: String) -> PyResult<String> {
    let response = py.detach(move || readability_core::boundary::process(&request));
    serde_json::to_string(&response).map_err(|e| PyRuntimeError::new_err(e.to_string()))
}

// Diagnostic-only entry: does not add clocks to the public extraction path.
// Timings exclude argument conversion before entry and return conversion.
#[pyfunction]
fn profile_extract_json(
    py: Python<'_>,
    html: String,
    options: String,
) -> PyResult<(String, u64, u64, u64)> {
    let start = std::time::Instant::now();
    let value = serde_json::from_str(&options).map_err(|e| PyValueError::new_err(e.to_string()))?;
    let options = readability_core::boundary::decode_extract_options(&value, true)
        .map_err(PyValueError::new_err)?;
    let decoded = start.elapsed().as_nanos() as u64;
    let start = std::time::Instant::now();
    let article = py
        .detach(|| readability_core::extract_html(&html, &options))
        .map_err(|e| PyRuntimeError::new_err(e.to_string()))?;
    let extracted = start.elapsed().as_nanos() as u64;
    let start = std::time::Instant::now();
    let output =
        serde_json::to_string(&article).map_err(|e| PyRuntimeError::new_err(e.to_string()))?;
    let serialized = start.elapsed().as_nanos() as u64;
    Ok((output, decoded, extracted, serialized))
}

#[pymodule]
fn _native(module: &Bound<'_, PyModule>) -> PyResult<()> {
    module.add("__version__", env!("CARGO_PKG_VERSION"))?;
    module.add_function(wrap_pyfunction!(validate_text, module)?)?;
    module.add_function(wrap_pyfunction!(extract_article, module)?)?;
    module.add_function(wrap_pyfunction!(readerable_direct, module)?)?;
    module.add_function(wrap_pyfunction!(profile_extract_article, module)?)?;
    module.add_function(wrap_pyfunction!(extract_json, module)?)?;
    module.add_function(wrap_pyfunction!(profile_extract_json, module)?)?;
    module.add_function(wrap_pyfunction!(readerable, module)?)?;
    module.add_function(wrap_pyfunction!(compatibility_request, module)?)?;
    Ok(())
}
