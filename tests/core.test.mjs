import test from 'node:test';
import assert from 'node:assert/strict';
import {normalize,resolveLocal,movePath,freshState,directories,validateState,base64,bytes,assertVacant} from '../src/core.js';
test('nested paths, queries, spaces and project root',()=>{
  assert.equal(resolveLocal('../css/main.css?v=2','game/pages/index.html','game'),'game/css/main.css');
  assert.equal(resolveLocal('/assets/a%20b.png','game/pages/index.html','game'),'game/assets/a b.png');
  assert.equal(resolveLocal('https://example.com/a.js','game/index.html','game'),null);
  assert.throws(()=>resolveLocal('../../other/app.js','game/index.html','game'));
  assert.throws(()=>resolveLocal('%2e%2e/secret','index.html',''));
  assert.throws(()=>normalize('__proto__/x'));
  assert.throws(()=>normalize('../private'));
});
test('move directory updates tabs, entries and empty folders atomically',()=>{
  const state=freshState();state.folders.push('Meu-site/vazia');
  movePath(state,'Meu-site','Jogos/Demo');
  assert.equal(state.current,'Jogos/Demo/index.html');
  assert.equal(state.root,'Jogos/Demo');
  assert.equal(state.entries['Jogos/Demo'],'Jogos/Demo/index.html');
  assert.ok(directories(state).includes('Jogos/Demo/vazia'));
  assert.ok(!directories(state).some(x=>x.startsWith('Meu-site')));
  const before=JSON.stringify(state);
  assert.throws(()=>movePath(state,'Jogos/Demo','Outro-projeto'));
  assert.equal(JSON.stringify(state),before);
});
test('binary data survives base64 and backup validation',()=>{
  const data=Uint8Array.from([0,255,128,27,10,0,99]);
  const file={type:'binary',content:base64(data)};
  assert.deepEqual(bytes(file),data);
  const state=freshState(false);state.files['assets/test.glb']=file;
  assert.deepEqual(bytes(validateState(JSON.parse(JSON.stringify(state))).files['assets/test.glb']),data);
});
test('file cannot become a directory implicitly',()=>{
  const state=freshState();assert.throws(()=>assertVacant(state,'Meu-site/index.html/file.txt'));
});
test('backup rejects invalid file data',()=>{
  assert.throws(()=>validateState({version:1,files:{}}));
  assert.throws(()=>validateState({version:2,files:{'../test':{type:'text',content:''}}}));
});

test('empty nested folders expose ancestors and imports reject path conflicts',()=>{
  const state=freshState(false);state.folders=['a/b/c'];
  assert.deepEqual(directories(state),['a','a/b','a/b/c']);
  state.files={'a':{type:'text',content:'x'},'a/file.txt':{type:'text',content:'y'}};
  assert.throws(()=>validateState(state));
});
