// SPDX-License-Identifier: Apache-2.0
use readability_core::{extract_html, Engine, ExtractOptions};
use std::{
    collections::HashSet,
    fs,
    io::{self, Read, Write},
    path::Path,
};

const HELP: &str = "Usage: readability-kit <file|-> --url <http(s)://page-address> [options]\n\nExtract an article from a saved HTML file or standard input.\nThe source URL resolves relative links; this command does not fetch pages.\n\nOptions:\n  --url <url>             Source page URL (required)\n  --engine <engine>       chromium (default) or mozilla\n  --format <format>       json (default), html, or text\n  --output <file>         Write the result to a file instead of standard output\n  -h, --help              Show this help\n  -v, --version           Show the package version\n\nExamples:\n  readability-kit article.html --url https://example.com/story\n  readability-kit - --url https://example.com/story --format text < article.html\n  readability-kit article.html --url https://example.com/story --output article.json\n\nHTML output is sanitized by default. Input files are never executed.\nExit codes: 0 success/help, 1 invalid arguments or processing error, 2 no article.\n";

#[derive(Default)]
struct Arguments {
    input: Option<String>,
    url: Option<String>,
    output: Option<String>,
    engine: Option<Engine>,
    format: Option<String>,
    help: bool,
    version: bool,
}
fn parse_arguments(argv: impl IntoIterator<Item = String>) -> Result<Arguments, String> {
    let mut result = Arguments::default();
    let mut args = argv.into_iter();
    let mut seen = HashSet::new();
    let mut positional = false;
    while let Some(arg) = args.next() {
        if !positional {
            match arg.as_str() {
                "--" => {
                    positional = true;
                    continue;
                }
                "--help" | "-h" => {
                    result.help = true;
                    continue;
                }
                "--version" | "-v" => {
                    result.version = true;
                    continue;
                }
                _ => {}
            }
            if arg.starts_with("--") {
                let (name, inline) = arg
                    .split_once('=')
                    .map_or((arg.as_str(), None), |(a, b)| (a, Some(b)));
                if !["--url", "--engine", "--format", "--output"].contains(&name) {
                    return Err(format!("Unknown option: {name}. Use --help for usage."));
                }
                if !seen.insert(name.to_owned()) {
                    return Err(format!("Option {name} was supplied more than once."));
                }
                let value = inline
                    .map(str::to_owned)
                    .or_else(|| args.next())
                    .filter(|v| !v.is_empty() && !v.starts_with("--"))
                    .ok_or_else(|| format!("Option {name} requires a value."))?;
                match name {
                    "--url" => result.url = Some(value),
                    "--output" => result.output = Some(value),
                    "--engine" => {
                        result.engine = Some(match value.as_str() {
                            "chromium" => Engine::Chromium,
                            "mozilla" => Engine::Mozilla,
                            _ => return Err("--engine must be chromium or mozilla.".into()),
                        })
                    }
                    _ => {
                        if !["json", "html", "text"].contains(&value.as_str()) {
                            return Err("--format must be json, html, or text.".into());
                        }
                        result.format = Some(value);
                    }
                }
                continue;
            }
            if arg != "-" && arg.starts_with('-') {
                return Err(format!(
                    "Unknown option: {arg}. Use -- before a filename beginning with a dash."
                ));
            }
        }
        if result.input.replace(arg).is_some() {
            return Err("Supply one HTML file, or - to read standard input.".into());
        }
    }
    Ok(result)
}

fn write_output(filename: &str, output: &[u8]) -> Result<(), Box<dyn std::error::Error>> {
    let destination = std::env::current_dir()?.join(filename);
    let parent = destination.parent().unwrap_or(Path::new("."));
    // Keep the temporary file on the destination filesystem for an atomic rename.
    let temporary = tempfile::Builder::new()
        .prefix(".readability-kit-")
        .tempdir_in(parent)?;
    let file = temporary.path().join("result");
    fs::write(&file, output)?;
    fs::rename(&file, &destination)?;
    Ok(())
}
fn run() -> Result<i32, Box<dyn std::error::Error>> {
    let args = parse_arguments(std::env::args().skip(1))?;
    if args.help {
        print!("{HELP}");
        return Ok(0);
    }
    if args.version {
        println!("{}", env!("CARGO_PKG_VERSION"));
        return Ok(0);
    }
    let input = args
        .input
        .ok_or("Supply an HTML file, or - to read standard input. Use --help for usage.")?;
    let source = args
        .url
        .ok_or("--url is required so relative links resolve correctly.")?;
    let source = url::Url::parse(&source)
        .ok()
        .filter(|u| matches!(u.scheme(), "http" | "https") && u.host_str().is_some())
        .ok_or("--url must be an absolute http:// or https:// URL.")?;
    let mut bytes = Vec::new();
    if input == "-" {
        io::stdin().read_to_end(&mut bytes)?;
    } else {
        bytes = fs::read(input)?;
    }
    let html = String::from_utf8_lossy(&bytes);
    let options = ExtractOptions {
        url: Some(source.to_string()),
        engine: args.engine.unwrap_or(Engine::Chromium),
        ..Default::default()
    };
    let Some(article) = extract_html(&html, &options)? else {
        eprintln!("readability-kit: No article was found in this input.");
        return Ok(2);
    };
    let mut output = match args.format.as_deref().unwrap_or("json") {
        "html" => article.content,
        "text" => article.text_content,
        _ => serde_json::to_string_pretty(&article)?,
    };
    if !output.ends_with('\n') {
        output.push('\n');
    }
    if let Some(filename) = args.output {
        write_output(&filename, output.as_bytes())?;
    } else {
        io::stdout().write_all(output.as_bytes())?;
    }
    Ok(0)
}
fn main() {
    let status = match run() {
        Ok(status) => status,
        Err(error) => {
            eprintln!("readability-kit: {error}");
            1
        }
    };
    std::process::exit(status);
}
