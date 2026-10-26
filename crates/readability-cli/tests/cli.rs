use std::{
    fs,
    io::Write,
    process::{Command, Output, Stdio},
};
fn invoke(args: &[&str], html: &str) -> Output {
    let mut child = Command::new(env!("CARGO_BIN_EXE_readability-kit"))
        .args(args)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .unwrap();
    child
        .stdin
        .take()
        .unwrap()
        .write_all(html.as_bytes())
        .unwrap();
    child.wait_with_output().unwrap()
}
fn article() -> String {
    format!("<html><head><title>A useful article</title></head><body><article><h1>A useful article</h1><p>{}</p><p>{}</p></article></body></html>",
        "This is a detailed paragraph about a useful subject, providing examples and explanations. ".repeat(20),
        "Another paragraph develops the subject further, and provides additional evidence. ".repeat(20))
}
#[test]
fn validates_arguments_even_with_help() {
    for args in [
        vec!["--wat", "--help"],
        vec!["--url=a", "--url=b"],
        vec!["--format"],
        vec!["-", "--url", "file:///x"],
    ] {
        let output = invoke(&args, "");
        assert_eq!(output.status.code(), Some(1));
        assert!(String::from_utf8_lossy(&output.stderr).starts_with("readability-kit: "));
    }
    let output = invoke(&["--help"], "");
    assert!(output.status.success());
    assert!(String::from_utf8_lossy(&output.stdout).contains("Exit codes:"));
}
#[test]
fn no_article_preserves_output() {
    let temp = tempfile::tempdir().unwrap();
    let destination = temp.path().join("existing.json");
    fs::write(&destination, "keep me").unwrap();
    let output = invoke(
        &[
            "-",
            "--url=https://example.com",
            "--engine=mozilla",
            "--output",
            destination.to_str().unwrap(),
        ],
        "<html><body></body></html>",
    );
    assert_eq!(output.status.code(), Some(2));
    assert_eq!(fs::read_to_string(destination).unwrap(), "keep me");
    assert_eq!(fs::read_dir(temp.path()).unwrap().count(), 1);
}
#[test]
fn formats_match_article_and_files_replace_atomically() {
    let html = article();
    let base = ["-", "--url=https://example.com/story", "--engine=mozilla"];
    let json = invoke(&base, &html);
    assert!(
        json.status.success(),
        "{}",
        String::from_utf8_lossy(&json.stderr)
    );
    let value: serde_json::Value = serde_json::from_slice(&json.stdout).unwrap();
    for (format, field) in [("text", "textContent"), ("html", "content")] {
        let mut args = base.to_vec();
        args.extend(["--format", format]);
        let output = invoke(&args, &html);
        assert!(output.status.success());
        assert_eq!(
            String::from_utf8(output.stdout).unwrap(),
            format!(
                "{}\n",
                value[field].as_str().unwrap().trim_end_matches('\n')
            )
        );
    }
    let temp = tempfile::tempdir().unwrap();
    let path = temp.path().join("result.json");
    fs::write(&path, "old").unwrap();
    let mut args = base.to_vec();
    args.extend(["--output", path.to_str().unwrap()]);
    let output = invoke(&args, &html);
    assert!(output.status.success());
    assert!(output.stdout.is_empty());
    assert_eq!(fs::read(path).unwrap(), json.stdout);
    assert_eq!(fs::read_dir(temp.path()).unwrap().count(), 1);
}
#[test]
fn write_failure_preserves_destination_directory() {
    let temp = tempfile::tempdir().unwrap();
    let destination = temp.path().join("directory");
    fs::create_dir(&destination).unwrap();
    fs::write(destination.join("keep"), "keep").unwrap();
    let output = invoke(
        &[
            "-",
            "--url=https://example.com",
            "--engine=mozilla",
            "--output",
            destination.to_str().unwrap(),
        ],
        &article(),
    );
    assert_eq!(output.status.code(), Some(1));
    assert_eq!(
        fs::read_to_string(destination.join("keep")).unwrap(),
        "keep"
    );
    assert_eq!(fs::read_dir(temp.path()).unwrap().count(), 1);
}

#[test]
fn default_chromium_keeps_continuation_header() {
    let html=article().replace("</article>","<h2>Continue reading the investigation</h2><p>This section belongs to the article and contains additional findings.</p></article>");
    let output = invoke(&["-", "--url=https://example.com/story"], &html);
    assert!(
        output.status.success(),
        "{}",
        String::from_utf8_lossy(&output.stderr)
    );
    let value: serde_json::Value = serde_json::from_slice(&output.stdout).unwrap();
    assert_eq!(value["engine"], "chromium");
    assert!(value["textContent"]
        .as_str()
        .unwrap()
        .contains("Continue reading the investigation"));
    assert!(value["textContent"]
        .as_str()
        .unwrap()
        .contains("additional findings"));
}
