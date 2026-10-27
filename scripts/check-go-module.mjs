#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// Verify that a separate consumer receives the bundled parser corrections.
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const root=fileURLToPath(new URL('../go/',import.meta.url));
const temp=await mkdtemp(join(tmpdir(),'readability-go-consumer-'));
try {
 await writeFile(join(temp,'go.mod'),`module readability-consumer\n\ngo 1.25.0\n\nrequire github.com/soulteary/readability-kit/go v0.0.0\n\nreplace github.com/soulteary/readability-kit/go => ${JSON.stringify(root.replaceAll('\\','/'))}\n`);
 await writeFile(join(temp,'main.go'),`package main
import (
 "context"
 "fmt"
 "strings"
 readability "github.com/soulteary/readability-kit/go"
)
func main(){
 threshold:=1
 input:="<html><head><title>Independent module parser check</title></head><body><article><p>"+strings.Repeat("Substantial article text, with useful details and explanatory prose. ",20)+"</p><p><a target=\\"_blank\\" href=\\"https://example.test/reference\\" data-kind=\\"ref\\">Reference</a><!--literal &lt;comment&gt;--></p></article></body></html>"
 a,err:=readability.ExtractRawHTML(context.Background(),input,readability.ExtractOptions{URL:"https://example.test/story",CharThreshold:&threshold})
 if err!=nil||a==nil{panic(fmt.Sprintf("extraction failed: %v",err))}
 if !strings.Contains(a.Content,"<a target=\\"_blank\\" href=\\"https://example.test/reference\\" data-kind=\\"ref\\">"){panic("formatting attribute order changed in consumer")}
 if !strings.Contains(a.Content,"<!--literal &lt;comment&gt;-->"){panic("comment entities changed in consumer")}
 if a.Length!=readability.UTF16Len(a.TextContent){panic("invalid text length")}
 fmt.Println("Independent Go module consumer: PASS")
}
`);
 const r=spawnSync(process.env.GO_BINARY||'go',['run','-mod=mod','.'],{cwd:temp,stdio:'inherit',env:process.env});
 if(r.error)throw r.error;
 if(r.status!==0)process.exitCode=r.status??1;
} finally { await rm(temp,{recursive:true,force:true}); }
