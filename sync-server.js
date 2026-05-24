const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const PORT = Number(process.env.NOTAS_SYNC_PORT || 8787);
const ROOT = __dirname;
const DATA_FILE = path.join(ROOT, 'datos_sincronizacion.json');

function generarId(){return 'srv_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,9)}
function clonar(o){return JSON.parse(JSON.stringify(o || {}))}
function normalizarSubtareas(lista){
  if(!Array.isArray(lista)) return [];
  return lista.map(s => typeof s === 'string'
    ? {id:generarId(),cod:'',texto:s,inicio:'',vence:'',fin:'',prioridad:'media',subtareas:[]}
    : {id:s.id||generarId(),cod:s.cod||'',texto:String(s.texto||''),inicio:s.inicio||'',vence:s.vence||'',fin:s.fin||'',prioridad:['baja','media','alta','critica'].includes(s.prioridad)?s.prioridad:'media',subtareas:normalizarSubtareas(s.subtareas||s.subs)}
  );
}
function normalizarTareas(lista){
  if(!Array.isArray(lista)) return [];
  return lista.map((t,i)=>({id:t.id||generarId(),cod:String(t.cod||String(i+1).padStart(4,'0')).slice(-4).padStart(4,'0'),texto:String(t.texto||t.tarea||'Sin texto'),inicio:t.inicio||'',vence:t.vence||'',fin:t.fin||'',prioridad:['baja','media','alta','critica'].includes(t.prioridad)?t.prioridad:'media',subtareas:normalizarSubtareas(t.subtareas||t.subs)}));
}
function paqueteVacio(){return {version:'v3-servidor',exportadoEn:new Date().toISOString(),tareas:[],historial:[],ultimoCambio:null,filtros:{},ajustes:{}}}
function leerDatos(){
  try{
    if(!fs.existsSync(DATA_FILE)) return paqueteVacio();
    const data = JSON.parse(fs.readFileSync(DATA_FILE,'utf8'));
    data.tareas = normalizarTareas(data.tareas || []);
    if(!Array.isArray(data.historial)) data.historial = [];
    return Object.assign(paqueteVacio(), data);
  }catch(e){
    console.error('No se pudo leer datos_sincronizacion.json:', e.message);
    return paqueteVacio();
  }
}
function guardarDatos(data){
  data.exportadoEn = new Date().toISOString();
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
}
function siguienteCodigo(lista){
  let max=0;(lista||[]).forEach(t=>{const n=parseInt(String(t.cod||'').replace(/\D/g,''),10);if(!isNaN(n))max=Math.max(max,n)});
  return String(max+1).padStart(4,'0').slice(-4);
}
function campoDiferente(a,b,c){return String(a&&a[c]!==undefined?a[c]:'')!==String(b&&b[c]!==undefined?b[c]:'')}
function descripcion(r,padre){return (padre?'Subtarea de '+padre:'Tarea '+(r.cod||'sin código'))+': '+String(r.texto||'sin texto').slice(0,80)}
function fusionarSubtareas(localLista, importLista, reporte, padreCod){
  if(!Array.isArray(localLista)) localLista=[];
  (importLista||[]).forEach(imp=>{
    const loc = localLista.find(x=>x.id&&imp.id&&x.id===imp.id);
    if(!loc){ localLista.push(clonar(imp)); reporte.subtareasAnadidas++; return; }
    ['texto','inicio','vence','fin','prioridad'].forEach(c=>{
      if(campoDiferente(loc,imp,c)) reporte.conflictos.push(descripcion(loc,padreCod)+' | campo '+c+' distinto. Servidor: ['+String(loc[c]||'')+'] / Dispositivo: ['+String(imp[c]||'')+']');
    });
    if(!Array.isArray(loc.subtareas)) loc.subtareas=[];
    fusionarSubtareas(loc.subtareas, imp.subtareas||[], reporte, padreCod);
  });
}
function fusionarTareas(locales, importadas){
  const reporte={tareasAnadidas:0,subtareasAnadidas:0,iguales:0,conflictos:[],codigosRenumerados:[]};
  const codigosLocales=()=>new Set((locales||[]).map(t=>String(t.cod||'')).filter(Boolean));
  (importadas||[]).forEach(imp=>{
    const loc = locales.find(x=>x.id&&imp.id&&x.id===imp.id);
    if(!loc){
      const copia=clonar(imp); const usados=codigosLocales();
      if(copia.cod && usados.has(String(copia.cod))){const old=copia.cod;copia.cod=siguienteCodigo(locales);reporte.codigosRenumerados.push(old+' → '+copia.cod+' (registro recibido: '+String(copia.texto||'').slice(0,60)+')')}
      locales.push(copia); reporte.tareasAnadidas++; return;
    }
    let diferente=false;
    ['texto','inicio','vence','fin','prioridad'].forEach(c=>{ if(campoDiferente(loc,imp,c)){diferente=true;reporte.conflictos.push(descripcion(loc)+' | campo '+c+' distinto. Servidor: ['+String(loc[c]||'')+'] / Dispositivo: ['+String(imp[c]||'')+']')} });
    if(!diferente) reporte.iguales++;
    if(!Array.isArray(loc.subtareas)) loc.subtareas=[];
    fusionarSubtareas(loc.subtareas, imp.subtareas||[], reporte, loc.cod||'');
  });
  return reporte;
}
function fusionarHistorial(local, entrante){
  if(!Array.isArray(local)) local=[]; if(!Array.isArray(entrante)) return 0;
  let n=0; const vistos=new Set(local.map(h=>String(h.fechaISO||'')+'|'+String(h.texto||'')));
  entrante.forEach(h=>{const k=String(h.fechaISO||'')+'|'+String(h.texto||''); if(!vistos.has(k)){local.push(h); vistos.add(k); n++;}});
  local.sort((a,b)=>String(b.fechaISO||'').localeCompare(String(a.fechaISO||'')));
  if(local.length>500) local.splice(500);
  return n;
}
function ipsLocales(){
  const out=[]; const nets=os.networkInterfaces();
  for(const name of Object.keys(nets)){ for(const n of nets[name]||[]){ if(n.family==='IPv4'&&!n.internal) out.push(n.address); } }
  return out;
}
function send(res, status, body, type='application/json'){
  res.writeHead(status, {'Content-Type': type, 'Access-Control-Allow-Origin':'*', 'Access-Control-Allow-Methods':'GET,POST,OPTIONS', 'Access-Control-Allow-Headers':'Content-Type'});
  res.end(type==='application/json'?JSON.stringify(body):body);
}
function leerBody(req){return new Promise((resolve,reject)=>{let body='';req.on('data',c=>{body+=c;if(body.length>20_000_000){reject(new Error('JSON demasiado grande'));req.destroy();}});req.on('end',()=>resolve(body));req.on('error',reject);});}
function servirArchivo(req,res){
  let urlPath = decodeURIComponent((req.url||'/').split('?')[0]);
  if(urlPath==='/' || urlPath==='') urlPath='/index.html';
  const file = path.normalize(path.join(ROOT, urlPath));
  if(!file.startsWith(ROOT)) return send(res,403,'Prohibido','text/plain; charset=utf-8');
  fs.readFile(file,(err,buf)=>{
    if(err) return send(res,404,'No encontrado','text/plain; charset=utf-8');
    const ext=path.extname(file).toLowerCase();
    const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.txt':'text/plain; charset=utf-8'};
    send(res,200,buf,types[ext]||'application/octet-stream');
  });
}
const server=http.createServer(async (req,res)=>{
  if(req.method==='OPTIONS') return send(res,204,{});
  const pathname=(req.url||'/').split('?')[0];
  try{
    if(req.method==='GET' && pathname==='/api/status'){
      const data=leerDatos();
      return send(res,200,{ok:true,nombre:'Notas de Tareas - servidor local',ip:ipsLocales().map(ip=>'http://'+ip+':'+PORT).join('  |  '),tareas:(data.tareas||[]).length,exportadoEn:data.exportadoEn});
    }
    if(req.method==='GET' && pathname==='/api/data') return send(res,200,{ok:true,data:leerDatos()});
    if(req.method==='POST' && pathname==='/api/sync'){
      const recibido=JSON.parse(await leerBody(req));
      const servidor=leerDatos();
      const entrantes=normalizarTareas(recibido.tareas||[]);
      const reporte=fusionarTareas(servidor.tareas, entrantes);
      const historialAnadido=fusionarHistorial(servidor.historial, recibido.historial||[]);
      reporte.historialAnadido=historialAnadido;
      if(recibido.ultimoCambio && (!servidor.ultimoCambio || String(recibido.ultimoCambio.fechaISO||'') > String(servidor.ultimoCambio.fechaISO||''))) servidor.ultimoCambio=recibido.ultimoCambio;
      guardarDatos(servidor);
      return send(res,200,{ok:true,reporte,data:servidor});
    }
    return servirArchivo(req,res);
  }catch(e){
    console.error(e);
    return send(res,500,{ok:false,error:e.message});
  }
});
server.listen(PORT,'0.0.0.0',()=>{
  console.log('============================================================');
  console.log(' SERVIDOR LOCAL - NOTAS DE TAREAS');
  console.log('============================================================');
  console.log('Ordenador: http://localhost:'+PORT);
  const ips=ipsLocales();
  if(ips.length){
    console.log('Para el MOVIL, usa una de estas direcciones:');
    ips.forEach(ip=>console.log('  http://'+ip+':'+PORT));
  }else{
    console.log('No se ha detectado IP local. Revisa la conexion de red.');
  }
  console.log('');
  console.log('Deja esta ventana abierta mientras quieras sincronizar.');
  console.log('Datos del servidor:', DATA_FILE);
  console.log('============================================================');
});
