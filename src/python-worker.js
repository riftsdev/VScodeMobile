let pyodide;
self.onmessage=async event=>{
  try{
    const {files,entry}=event.data;
    if(!pyodide){importScripts('https://cdn.jsdelivr.net/pyodide/v0.26.4/full/pyodide.js');pyodide=await loadPyodide();}
    pyodide.setStdout({batched:text=>postMessage({level:'log',text})});
    pyodide.setStderr({batched:text=>postMessage({level:'error',text})});
    pyodide.FS.mkdirTree('/project');
    for(const [path,content]of Object.entries(files)){const dest='/project/'+path;pyodide.FS.mkdirTree(dest.slice(0,dest.lastIndexOf('/')));pyodide.FS.writeFile(dest,content);}
    pyodide.FS.chdir('/project');
    await pyodide.runPythonAsync("import sys, runpy\nsys.path.insert(0, '/project')");
    pyodide.globals.set('__kg_entry','/project/'+entry);
    await pyodide.runPythonAsync("runpy.run_path(__kg_entry, run_name='__main__')");
    postMessage({level:'info',text:'Python concluído.'});
  }catch(e){postMessage({level:'error',text:e.message||String(e)});}
};
