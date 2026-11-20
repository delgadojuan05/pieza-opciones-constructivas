
import * as THREE from 'three';
import {OrbitControls} from 'orbit';

async function loadModel(){
  const label=document.getElementById('loading-message');
  label.textContent='Descargando las tres opciones…';
  let data;
  if('DecompressionStream' in window){
    const response=await fetch(new URL('./assets/model.json.gz',import.meta.url));
    if(!response.ok)throw Error('No se pudo descargar el modelo ('+response.status+').');
    const bytes=await response.arrayBuffer();
    label.textContent='Preparando las piezas…';
    const stream=new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
    data=await new Response(stream).json();
  }else{
    const response=await fetch(new URL('./assets/model.json',import.meta.url));
    if(!response.ok)throw Error('No se pudo descargar el modelo.');
    data=await response.json();
  }
  if(data.options?.length!==3||data.solidCount!==1352)throw Error('El modelo está incompleto.');
  label.textContent='Preparando la vista 3D…';
  await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
  return data;
}

const data=await loadModel(),$=id=>document.getElementById(id),nf=new Intl.NumberFormat('es-UY',{maximumFractionDigits:2});
const rawParts=data.parts,parts=[],pickables=[],systemColors=['#8ba695','#b1b8a0','#b5a38a','#a9b9bc','#ccae89','#aebfc8','#b9957b','#859b8a','#c4b8a0','#a9b88f'];
let activeOption=0,selected=null,selectedElement=null,isolation=false,elementIsolation=false,mode='explode',amount=0,drag=null,timer;
let scene,renderer,camera,controls,guideLines,baseSize,overall,center,initialized=false;
const v=new THREE.Vector3(),ray=new THREE.Raycaster();
function decode(s){const b=atob(s),a=new Uint8Array(b.length);for(let i=0;i<b.length;i++)a[i]=b.charCodeAt(i);return new Float32Array(a.buffer);}
function safe(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function label(name){let n=name.replace(/^Layer:/,'').replace(/^3D_/,'').replaceAll('_',' ').replace('VGAS HORMIGON','VIGAS DE HORMIGÓN').replaceAll('HORMIGON','HORMIGÓN').replaceAll('TERMINACION','TERMINACIÓN');if(n==='0')return 'Elemento 0';return n.toLocaleLowerCase('es').replace(/^\p{L}/u,c=>c.toUpperCase());}
function materialColor(material,name=''){const n=((material?.name||'')+' '+name).toLowerCase();if(/parquet|wood|madera|terminacion/.test(n))return '#b99165';if(/black|perfiles|estructura|viga principal|viga secundaria/.test(n))return '#59635b';if(/galvanized|baranda|steel deck|chapa/.test(n))return '#abb7b8';if(/limestone|loseta|pavimento/.test(n))return '#bdb39c';if(/concrete|hormigon/.test(n))return '#bec3b8';return '#aeb9ad';}
function toast(s){$('toast').textContent=s;$('toast').hidden=false;clearTimeout(timer);timer=setTimeout(()=>$('toast').hidden=true,4500);}
function showDialog(title,html){$('dialog-content').innerHTML=`<h2>${title}</h2>${html}`;$('dialog').showModal();}
function init(){
  scene=new THREE.Scene();renderer=new THREE.WebGLRenderer({alpha:true,antialias:true,preserveDrawingBuffer:false});renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.15;$('canvas').append(renderer.domElement);
  camera=new THREE.OrthographicCamera(-15,15,10,-10,.01,10000);camera.position.set(24,15,-26);
  controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.dampingFactor=.1;controls.maxPolarAngle=Math.PI*.95;controls.mouseButtons.LEFT=null;controls.mouseButtons.RIGHT=THREE.MOUSE.ROTATE;controls.mouseButtons.MIDDLE=THREE.MOUSE.PAN;controls.touches.ONE=null;controls.touches.TWO=THREE.TOUCH.DOLLY_PAN;
  scene.add(new THREE.HemisphereLight(0xf9fcff,0xa0ab94,2.1));const sun=new THREE.DirectionalLight(0xfff4db,2.4);sun.position.set(-10,25,15);scene.add(sun);const fill=new THREE.DirectionalLight(0xe2edff,.8);fill.position.set(15,8,-15);scene.add(fill);
  const worldBox=new THREE.Box3();for(const p of rawParts)for(const e of p.elements){worldBox.expandByPoint(new THREE.Vector3(...e.bounds[0]));worldBox.expandByPoint(new THREE.Vector3(...e.bounds[1]));}center=worldBox.getCenter(new THREE.Vector3());overall=worldBox.getSize(new THREE.Vector3());baseSize=Math.max(overall.x,overall.y,overall.z);center.y=worldBox.min.y;
  rawParts.forEach((raw,i)=>{
    const group=new THREE.Group();scene.add(group);const part={raw,group,id:i,option:raw.option,title:label(raw.name),elements:[],visible:!raw.hidden,spread:0,color:materialColor(raw.material,raw.name),box:new THREE.Box3(),offset:0};
    raw.elements.forEach((e,j)=>{const pos=decode(e.positions),norm=decode(e.normals);for(let k=0;k<pos.length;k+=3){pos[k]-=center.x;pos[k+1]-=center.y;pos[k+2]-=center.z;}
      const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(pos,3));g.setAttribute('normal',new THREE.BufferAttribute(norm,3));g.normalizeNormals();g.computeBoundingBox();
      const mat=new THREE.MeshStandardMaterial({color:part.color,metalness:/metal/i.test(raw.material?.name||'')?.25:0,roughness:.8,side:THREE.DoubleSide});
      const mesh=new THREE.Mesh(g,mat);mesh.userData={part:i,element:j};group.add(mesh);pickables.push(mesh);
      const edges=new THREE.LineSegments(new THREE.EdgesGeometry(g,25),new THREE.LineBasicMaterial({color:0x394735,transparent:true,opacity:.18}));mesh.add(edges);
      const box=g.boundingBox.clone(),centroid=box.getCenter(new THREE.Vector3());part.box.union(box);part.elements.push({mesh,edges,box,center:centroid,dir:new THREE.Vector3(),triangles:e.triangles});
    });
    part.center=part.box.getCenter(new THREE.Vector3());group.visible=part.visible&&part.option===activeOption;parts.push(part);
  });
  for(let option=0;option<3;option++){const sorted=parts.filter(p=>p.option===option).sort((a,b)=>a.center.y-b.center.y||a.id-b.id),gap=Math.max(.4,overall.y*.13);let top=-Infinity;sorted.forEach((p,i)=>{p.offset=i?Math.max(0,top+gap-p.box.min.y):0;top=p.box.max.y+p.offset;});}
  for(const p of parts){for(const [i,e]of p.elements.entries()){let d=e.center.clone().sub(p.center);d.y*=.35;if(d.length()<.02)d.set(Math.cos(i*2.4),.3,Math.sin(i*2.4));e.dir.copy(d.normalize()).multiplyScalar(Math.max(.35,baseSize*.13));}}
  guideLines=new THREE.Group();scene.add(guideLines);
  const grid=new THREE.GridHelper(baseSize*4,48,0xc2cbb6,0xd4dbc9);grid.material.transparent=true;grid.material.opacity=.36;grid.position.y=-.03;scene.add(grid);
  updateOptionInfo();renderList();
  const observer=new ResizeObserver(resize);observer.observe($('canvas'));controls.addEventListener('change',render);resize();fit('axo');initialized=true;
  let previous=0;function tick(t){requestAnimationFrame(tick);if(t-previous<30)return;previous=t;controls.autoRotate=$('autorotate').checked;controls.autoRotateSpeed=.25;if(controls.update()||controls.autoRotate)render();}requestAnimationFrame(tick);
  renderer.domElement.addEventListener('pointerdown',down);renderer.domElement.addEventListener('pointermove',move);renderer.domElement.addEventListener('pointerup',up);renderer.domElement.addEventListener('pointercancel',()=>{drag=null;});renderer.domElement.addEventListener('contextmenu',e=>e.preventDefault());render();
}
function visiblePartsBox(){const b=new THREE.Box3();for(const p of parts)if(p.group.visible)for(const e of p.elements)if(e.mesh.visible){const box=e.box.clone();box.translate(e.mesh.position);box.translate(p.group.position);b.union(box);}return b;}
function resize(){const r=$('canvas').getBoundingClientRect();renderer.setSize(r.width,r.height);const aspect=r.width/r.height,half=(camera.top-camera.bottom)/2;camera.left=-half*aspect;camera.right=half*aspect;camera.updateProjectionMatrix();if(initialized&&$('autofit').checked)fit(null);else render();}
function fit(view,box){box=box||visiblePartsBox();if(box.isEmpty())return;const target=box.getCenter(new THREE.Vector3()),radius=Math.max(box.getSize(new THREE.Vector3()).length()/2,.15);let direction=camera.position.clone().sub(controls.target).normalize();
  if(view==='axo')direction.set(1,.7,-1.3).normalize();if(view==='front')direction.set(.69,.025,-.725).normalize();
  controls.target.copy(target);camera.position.copy(target).addScaledVector(direction,Math.max(100,radius*7));camera.lookAt(target);camera.updateMatrixWorld();
  const inv=camera.matrixWorldInverse,projected=new THREE.Box3();for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z])projected.expandByPoint(new THREE.Vector3(x,y,z).applyMatrix4(inv));
  const r=$('canvas').getBoundingClientRect(),aspect=r.width/r.height,span=projected.getSize(new THREE.Vector3());let half=Math.max(span.y/2,span.x/(2*aspect),.1)*1.35;
  const padding=r.width<800?1.24:1.1;half*=padding;
  camera.left=-half*aspect;camera.right=half*aspect;camera.top=half*.84;camera.bottom=-half*1.16;camera.zoom=1;camera.updateProjectionMatrix();controls.update();if(view)$('view-label').textContent=view==='front'?'ELEVACIÓN':'AXONOMETRÍA';render();
}
function render(){if(!renderer)return;scene.updateMatrixWorld();renderer.render(scene,camera);updateMarker();}
function renderList(){const query=$('search').value.trim().toLocaleLowerCase('es');$('parts').innerHTML='';let matches=0;
  for(const p of parts){if((activeOption!=='all'&&p.option!==activeOption)||!p.title.toLocaleLowerCase('es').includes(query))continue;matches++;const row=document.createElement('div');row.className='part'+(selected===p.id?' selected':'');row.style.setProperty('--c',p.color);row.dataset.part=p.id;
    row.innerHTML=`<span class="part-num">${String(p.id+1).padStart(2,'0')}</span><span class="part-color"></span><button class="part-name" title="${safe(p.raw.name)}"><strong>${safe(p.title)}</strong><small>${activeOption==='all'?'Opción '+(p.option+1)+' · ':''}${p.elements.length===1?'Una pieza':p.elements.length+' piezas'}</small></button><input type="checkbox" ${p.visible?'checked':''} aria-label="Mostrar ${safe(p.title)} de opción ${p.option+1}">`;
    row.querySelector('button').onclick=()=>select(p.id);row.querySelector('input').onclick=e=>{p.visible=e.target.checked;applyVisibility();drawGuides();render();};$('parts').append(row);
  }if(!matches)$('parts').innerHTML='<p class="no-result">No se encontraron componentes con ese nombre.</p>';
}
function select(id,element=null){selected=id;selectedElement=element;elementIsolation=false;if(isolation)applyVisibility();renderList();showDetails();highlight();render();}
function showDetails(){const p=parts[selected];$('detail').hidden=!p;if(!p)return;const element=selectedElement===null?null:p.elements[selectedElement];$('part-title').textContent=p.title+(element?' · '+String(selectedElement+1).padStart(2,'0'):'');$('source-name').textContent=p.raw.name;const size=(element?element.box:p.box).getSize(new THREE.Vector3());
  $('details').innerHTML=[['Extensión X',nf.format(size.x)+' m'],['Extensión Y',nf.format(size.z)+' m'],['Altura',nf.format(size.y)+' m'],[element?'Elemento':'Elementos',element?(selectedElement+1)+' de '+p.elements.length:p.elements.length],['Triángulos',new Intl.NumberFormat('es-UY').format(element?element.triangles:p.raw.triangles)]].map(([k,val])=>`<dt>${k}</dt><dd>${val}</dd>`).join('');
  $('isolate').classList.toggle('active',isolation);$('isolate').textContent=isolation?'Ver todo':'Aislar';$('element-spread').value=p.spread*100;$('element-percent').textContent=Math.round(p.spread*100)+' %';$('element-spread').disabled=p.elements.length<2;
  $('element-note').textContent=p.elements.length>1?'Sólidos del CAD agrupados por capa. Su separación es ilustrativa.':'Esta capa contiene un sólido del CAD.';
  const list=$('elements');list.innerHTML='';if(p.elements.length>1){p.elements.forEach((e,i)=>{const b=document.createElement('button');b.textContent=`Elemento ${String(i+1).padStart(2,'0')}`;b.title='Aislar esta pieza del CAD';if(selectedElement===i)b.classList.add('active');b.onclick=()=>{selectedElement=i;elementIsolation=true;isolation=true;applyVisibility();highlight();showDetails();fit(null,elementBox(p,e));toast(`Elemento ${i+1} aislado. «Ver conjunto» restaura todas las piezas.`);};list.append(b);});}
}
function elementBox(p,e){return e.box.clone().translate(e.mesh.position).translate(p.group.position);}
function highlight(){for(const p of parts)for(const [i,e]of p.elements.entries()){const active=p.id===selected&&(selectedElement===null||selectedElement===i);e.mesh.material.emissive.set(active?0x5c3f24:0x000000);e.mesh.material.emissiveIntensity=active?.17:0;e.edges.material.opacity=active?.5:.18;}updateMarker();}
function applyVisibility(){for(const p of parts){p.group.visible=p.visible&&(activeOption==='all'||p.option===activeOption)&&(!isolation||p.id===selected);for(const [i,e]of p.elements.entries())e.mesh.visible=!elementIsolation||p.id!==selected||i===selectedElement;}renderList();drawGuides();render();}
function updateOptionInfo(){const count=parts.filter(p=>activeOption==='all'||p.option===activeOption).length;$('count').textContent=count;$('piece-stat').textContent=count;$('option-caption').innerHTML=activeOption==='all'?'Las tres alternativas en su posición original en el CAD.':`<span class="option-key">Opción ${activeOption+1}</span> · ${safe(data.options[activeOption].summary)}<br>Orden según el eje X del CAD, de menor a mayor.`;document.querySelectorAll('[data-option]').forEach(b=>{const on=String(b.dataset.option)===String(activeOption);b.classList.toggle('active',on);b.setAttribute('aria-pressed',String(on));});}
function selectOption(value){activeOption=value==='all'?'all':Number(value);selected=null;selectedElement=null;isolation=false;elementIsolation=false;$('search').value='';applyVisibility();showDetails();highlight();updateOptionInfo();fit('axo');}
function updateMarker(){const p=parts[selected];if(!p||!p.group.visible){$('selected-marker').hidden=true;return;}const point=(selectedElement===null?p.box.getCenter(new THREE.Vector3()):p.elements[selectedElement].center.clone().add(p.elements[selectedElement].mesh.position)).add(p.group.position);point.project(camera);const r=$('canvas').getBoundingClientRect();$('selected-marker').hidden=point.z<-1||point.z>1||Math.abs(point.x)>1||Math.abs(point.y)>1;if(!$('selected-marker').hidden){$('selected-marker').textContent=String(p.id+1).padStart(2,'0');$('selected-marker').style.left=((point.x+1)*r.width/2)+'px';$('selected-marker').style.top=((-point.y+1)*r.height/2)+'px';}}
function drawGuides(){if(!guideLines)return;while(guideLines.children.length){const c=guideLines.children[0];c.geometry.dispose();c.material.dispose();guideLines.remove(c);}guideLines.visible=$('guides').checked;if(!guideLines.visible||!amount)return;
  for(const p of parts){if(!p.group.visible||!p.offset)continue;const a=p.center.clone(),b=a.clone().add(p.group.position),g=new THREE.BufferGeometry().setFromPoints([a,b]);const line=new THREE.Line(g,new THREE.LineDashedMaterial({color:0x8da17c,dashSize:.15,gapSize:.12,transparent:true,opacity:.4}));line.computeLineDistances();guideLines.add(line);}}
function explode(value,auto=true){amount=Math.max(0,Math.min(1,Number(value)));$('explode').value=Math.round(amount*100);$('explode-percent').textContent=Math.round(amount*100)+' %';$('state-label').textContent=amount===0?'Posición original de las piezas':'Separación ilustrativa · alineación en planta conservada';
  for(const p of parts){p.group.position.y=p.offset*amount;for(const e of p.elements)e.mesh.position.copy(e.dir).multiplyScalar(p.spread);}
  drawGuides();if(auto&&$('autofit').checked)fit(null);else render();}
function down(e){if(e.button!==0||!e.isPrimary)return;drag={id:e.pointerId,startY:e.clientY,startX:e.clientX,lastX:e.clientX,lastY:e.clientY,initial:amount,moved:false};if(mode==='explode'){renderer.domElement.setPointerCapture(e.pointerId);e.preventDefault();}}
function move(e){if(!drag||e.pointerId!==drag.id)return;drag.lastX=e.clientX;drag.lastY=e.clientY;if(Math.hypot(e.clientX-drag.startX,e.clientY-drag.startY)>4)drag.moved=true;if(mode==='explode'&&drag.moved){e.preventDefault();explode(drag.initial+(drag.startY-e.clientY)/Math.max(240,$('canvas').clientHeight*.6));}}
function up(e){if(!drag||e.pointerId!==drag.id)return;const was=drag;drag=null;if(renderer.domElement.hasPointerCapture(e.pointerId))renderer.domElement.releasePointerCapture(e.pointerId);if(!was.moved){const r=renderer.domElement.getBoundingClientRect();ray.setFromCamera(new THREE.Vector2((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1),camera);const objects=pickables.filter(m=>m.visible&&m.parent.visible),hit=ray.intersectObjects(objects,false)[0];if(hit)select(hit.object.userData.part,hit.object.userData.element);}}
function setMode(next){mode=next;controls.mouseButtons.LEFT=mode==='orbit'?THREE.MOUSE.ROTATE:null;controls.touches.ONE=mode==='orbit'?THREE.TOUCH.ROTATE:null;$('mode-explode').classList.toggle('active',mode==='explode');$('mode-orbit').classList.toggle('active',mode==='orbit');$('gesture-hint').textContent=mode==='explode'?'Arrastrá para desarmar':'Arrastrá para girar';renderer.domElement.style.cursor=mode==='explode'?'ns-resize':'grab';}
function resetView(){isolation=false;elementIsolation=false;selectedElement=null;for(const p of parts){p.visible=true;p.spread=0;}applyVisibility();explode(0);showDetails();highlight();fit('axo');}
function appearance(){for(const p of parts)for(const e of p.elements){const mode=$('appearance').value;e.mesh.material.color.set(mode==='white'?'#e8e5d8':mode==='systems'?systemColors[p.id%systemColors.length]:p.color);}render();}
try{init();setMode('explode');
  document.querySelectorAll('[data-option]').forEach(b=>b.onclick=()=>selectOption(b.dataset.option));
  $('explode').oninput=e=>explode(Number(e.target.value)/100);$('assemble').onclick=()=>{for(const p of parts)p.spread=0;explode(0);showDetails();};$('expand').onclick=()=>explode(1);$('show-all').onclick=resetView;$('search').oninput=renderList;$('appearance').onchange=appearance;
  $('edges').onchange=()=>{for(const p of parts)for(const e of p.elements)e.edges.visible=$('edges').checked;render();};$('guides').onchange=()=>{drawGuides();render();};$('autofit').onchange=()=>{if($('autofit').checked)fit(null);};
  $('mode-explode').onclick=()=>setMode('explode');$('mode-orbit').onclick=()=>setMode('orbit');$('fit').onclick=()=>fit(null);$('front').onclick=()=>fit('front');$('axo').onclick=()=>fit('axo');
  $('isolate').onclick=()=>{isolation=!isolation;elementIsolation=false;selectedElement=null;applyVisibility();showDetails();highlight();fit(null);};$('focus').onclick=()=>{const p=parts[selected];if(p){const b=selectedElement===null?p.box.clone().translate(p.group.position):elementBox(p,p.elements[selectedElement]);fit(null,b);}};
  $('deselect').onclick=()=>{selected=null;selectedElement=null;isolation=false;elementIsolation=false;applyVisibility();showDetails();highlight();};
  $('element-spread').oninput=e=>{const p=parts[selected];if(!p)return;p.spread=Number(e.target.value)/100;$('element-percent').textContent=e.target.value+' %';explode(amount);};
  $('mobile-layers').onclick=()=>{$('side').classList.toggle('open');$('close-side').hidden=false;};$('close-side').onclick=()=>$('side').classList.remove('open');
  $('help').onclick=()=>showDialog('Explorá cómo está armado.',`<p>Este visor usa la geometría de tu archivo <strong>Drawing2.dwg</strong>, con sus componentes separados.</p><ul><li><strong>Desarmar:</strong> arrastrá hacia arriba para separar y hacia abajo para rearmar. Al soltar, se conserva la posición. También podés usar el deslizador.</li><li><strong>Girar:</strong> activá «Girar» o mantené el botón derecho del mouse. La rueda acerca o aleja; el botón central desplaza.</li><li><strong>Elegir una pieza:</strong> hacé clic en el modelo o en la lista. «Aislar» permite verla sola y «Acercar» encuadra sus detalles.</li><li><strong>Elementos internos:</strong> podés separar y seleccionar los sólidos individuales de cada capa del CAD.</li><li><strong>Rearmar:</strong> «Volver a armar» devuelve las piezas a sus coordenadas originales. «Ver conjunto» también restaura la visibilidad y la cámara.</li></ul><div class="callout">El despiece es una herramienta de presentación; su orden y separación son ilustrativos, no una secuencia de montaje validada. Los colores son aproximaciones de materiales. Las extensiones mostradas son cajas envolventes, no cotas de fabricación.</div>`);
  $('source-info').onclick=()=>showDialog('Tres alternativas del mismo CAD.',`<p>Fuente: <strong>Drawing2.dwg</strong>. Se incluyeron los <strong>${data.solidCount} sólidos 3D</strong> del inventario de AutoCAD, agrupados por capas.</p><p>Las alternativas se identificaron por su posición en el eje X del dibujo, de menor a mayor. «Comparar las tres» conserva su ubicación original. No se modificaron las formas ni las relaciones entre piezas de cada alternativa.</p><p>El archivo declara milímetros, pero confirmaste que <strong>una unidad CAD representa un metro</strong>. El visor usa esa equivalencia. Los nombres provienen de las capas; los colores son referencias simplificadas.</p><div class="callout">El despiece y su secuencia son ilustrativos. Los tamaños mostrados son cajas envolventes. Las líneas, hachurados y bloques de documentación 2D se omitieron para evitar convertir referencias gráficas en piezas 3D. La geometría del visor se carga desde este mismo sitio.</div>`);
  $('close-dialog').onclick=()=>$('dialog').close();document.addEventListener('keydown',e=>{if($('dialog').open||/INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName))return;if(e.key.toLowerCase()==='f')fit(null);if(e.key==='Escape'){selected=null;selectedElement=null;isolation=false;elementIsolation=false;applyVisibility();showDetails();highlight();}});
  $('loading').hidden=true;$('view').setAttribute('aria-busy','false');document.documentElement.dataset.viewerState='ready';performance.mark('pieza-ready');
}catch(error){$('loading').hidden=true;$('view').setAttribute('aria-busy','false');document.documentElement.dataset.viewerState='error';$('error').hidden=false;$('error').textContent='No se pudo iniciar la vista 3D. Abrí este HTML en un navegador actualizado con aceleración gráfica. '+error.message;console.error(error);}
