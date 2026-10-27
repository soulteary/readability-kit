// SPDX-License-Identifier: Apache-2.0
use std::path::Path;

// A standalone sdist legitimately prunes unrelated workspace packages. Every
// retained package must still match the prepared lock snapshot exactly.
pub fn lock_is_covered(current: &str, prepared: &str) -> bool {
    let packages = |text: &str| -> std::collections::BTreeSet<String> {
        text.split("[[package]]")
            .skip(1)
            .map(|block| {
                block
                    .lines()
                    .collect::<Vec<_>>()
                    .join("\n")
                    .trim()
                    .to_owned()
            })
            .collect()
    };
    let current = packages(current);
    !current.is_empty() && current.is_subset(&packages(prepared))
}

fn main() {
    // Other workspace builds do not need Python distribution metadata.
    if std::env::var_os("CARGO_FEATURE_EXTENSION_MODULE").is_none() {
        return;
    }
    let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("../..");
    let directory = [
        root.join("python/src/readability_kit/_licenses"),
        root.join("src/readability_kit/_licenses"),
    ]
    .into_iter()
    .find(|path| path.join("DEPENDENCIES.json").is_file())
    .expect("Missing Python dependency notices: run tools/build-python-package.py first");
    let prepared_target = directory.join("TARGET");
    println!("cargo:rerun-if-changed={}", prepared_target.display());
    let prepared_target = std::fs::read_to_string(prepared_target).expect("read prepared target");
    assert!(
        prepared_target.trim() == "all"
            || prepared_target.trim() == std::env::var("TARGET").expect("Cargo target"),
        "Python dependency notices target mismatch: prepare notices for the build target"
    );
    let lock = root.join("Cargo.lock");
    let prepared_lock = directory.join("Cargo.lock");
    println!("cargo:rerun-if-changed={}", lock.display());
    println!("cargo:rerun-if-changed={}", prepared_lock.display());
    assert!(
        lock_is_covered(
            &std::fs::read_to_string(lock).expect("read workspace lockfile"),
            &std::fs::read_to_string(prepared_lock).expect("read prepared lockfile")
        ),
        "Stale Python dependency notices: run tools/build-python-package.py again"
    );
    for name in ["DEPENDENCIES.json", "LICENSE", "NOTICE", "SHA256SUMS"] {
        let file = directory.join(name);
        assert!(
            file.is_file(),
            "Missing Python distribution metadata: {name}"
        );
        println!("cargo:rerun-if-changed={}", file.display());
    }
}
