// SPDX-License-Identifier: Apache-2.0
//! Machine protocol shared with the WASM boundary.
use std::io::{self, Read};
fn main() {
    let mut input = String::new();
    match io::stdin().read_to_string(&mut input) {
        Ok(_) => println!("{}", readability_core::boundary::process(&input)),
        Err(error) => {
            eprintln!("{error}");
            std::process::exit(1);
        }
    }
}
