import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:http';
import { fromFile } from 'geotiff';
import VectorLayer from 'ol/layer/Vector.js';
import LayerGroup from 'ol/layer/Group.js';
import { LayerManager, readGeoJSON } from '../src/layers/manager.js';
import { geologyStyles } from '../src/layers/geology.js';
import { layerConfig } from '../src/config/app.js';
import { registerMarsProjection, MARS_CRS } from '../src/map/marsProjection.js';

registerMarsProjection();
const config = layerConfig.find(config => config.id === 'geology');
const rasterFile = new URL('../public/maps/rasters/04_Geology_20m_COG.tif', import.meta.url);
const paths = ['04_Goudge_Geology.geojson', '04_USGS_Geology.geojson'];
const buffers = await Promise.all(paths.map(name => readFile(new URL(`../public/maps/vectors/${name}`, import.meta.url))));
const raw = buffers.map(bytes => JSON.parse(bytes));

test('both actual geology datasets are planetary MultiPolygons with real unit attributes and no POIs', () => {
  for (const [index, data] of raw.entries()) {
    assert.equal(data.crs, undefined);
    assert.equal(data.features.length, index === 0 ? 113 : 1021);
    assert.ok(data.features.every(feature => feature.geometry.type === 'MultiPolygon'));
    const features = readGeoJSON(data, MARS_CRS, MARS_CRS);
    for (const position of [0, Math.floor(features.length/2), features.length-1]) {
      assert.deepEqual(features[position].getGeometry().getCoordinates(), data.features[position].geometry.coordinates);
      assert.deepEqual(Object.fromEntries(Object.entries(features[position].getProperties()).filter(([key]) => key !== 'geometry')), data.features[position].properties);
    }
    const styling = geologyStyles(features, config.vectors[index].categoryField, index === 0);
    assert.equal(styling.styles.size, index === 0 ? 17 : 14);
    const style = styling.style(features[0]);
    assert.equal(style, styling.style(features[0]));
    assert.equal(style.getFill().getColor()[3], 0.14);
    assert.equal(Boolean(style.getStroke().getLineDash()), index === 0);
    assert.equal(style.getImage(), null, 'polygons must not be presented as fabricated POI markers');
  }
  assert.equal(raw[0].features[0].properties.Unit_Name, 'Thin dark capping unit');
  assert.equal(raw[1].features[0].properties.name, 'Upper etched unit');
  assert.equal(raw[1].features[0].properties.symbol, 'Nue');
  assert.equal(raw[1].features[0].properties.Color_ID, 74);
});

test('geology COG preserves its RGBA colors and matches the existing Jezero projection', async () => {
  const tiff = await fromFile(fileURLToPath(rasterFile));
  try {
    const image = await tiff.getImage();
    const keys = image.getGeoKeys();
    assert.deepEqual(image.getBoundingBox(), config.extent);
    assert.deepEqual(image.getResolution(), [20,-20,0]);
    assert.equal(image.getSamplesPerPixel(),4);
    assert.equal(image.getFileDirectory().getValue('PhotometricInterpretation'),2);
    assert.deepEqual(Array.from(image.getFileDirectory().getValue('BitsPerSample')),[8,8,8,8]);
    assert.equal(keys.GeogSemiMajorAxisGeoKey,3396190);
    assert.equal(keys.GeogSemiMinorAxisGeoKey,3396190);
    assert.equal(keys.ProjStdParallel1GeoKey,18.4663);
    assert.equal(keys.ProjCenterLongGeoKey,0);
    assert.equal(keys.ProjCenterLatGeoKey,0);
    assert.equal(keys.ProjFalseEastingGeoKey,0);
    assert.equal(keys.ProjFalseNorthingGeoKey,0);
    assert.equal(keys.ProjCoordTransGeoKey,17);
    assert.deepEqual(Array.from(await image.readRasters({window:[2304,2560,2305,2561],interleave:true})),[187,131,122,255]);
  } finally { await tiff.close(); }
});

test('switching to and from geology hides the complete group without altering other overlay behavior', () => {
  const manager=new LayerManager({addLayer(){}},[
    {id:'imagery',type:'cog',visible:true},
    {id:'contours',type:'contours',visible:true},
    {...config},
    {id:'routes',type:'geojson',visible:true},
  ],MARS_CRS);
  for(const entry of manager.entries.values()) entry.layer=new VectorLayer();
  const children=[new VectorLayer(),new VectorLayer(),new VectorLayer()];
  manager.get('geology').layer=new LayerGroup({layers:children});
  manager.setVisible('geology',true);
  assert.equal(manager.get('imagery').config.visible,false);
  assert.equal(manager.get('contours').config.visible,false);
  assert.equal(manager.get('routes').config.visible,true);
  assert.ok(manager.get('geology').layer.getLayerStatesArray().every(state=>state.visible));
  manager.setVisible('imagery',true);
  assert.equal(manager.get('geology').config.visible,false);
  assert.ok(manager.get('geology').layer.getLayerStatesArray().every(state=>!state.visible));
  manager.setVisible('contours',true);
  assert.equal(manager.get('imagery').config.visible,true,'existing non-geology overlays remain independent');
  for(const entry of manager.entries.values()) entry.layer.dispose();
  children.forEach(layer=>layer.dispose());
});

test('lazy composite loads all three files once and honors changes made while loading', async t => {
  const rasterBytes = await readFile(rasterFile);
  const requests = new Map();
  const server = createServer((request,response) => {
    requests.set(request.url,(requests.get(request.url)||0)+1);
    const index = paths.indexOf(request.url.slice(1));
    if (index >= 0) {
      response.writeHead(200,{'Content-Type':'application/geo+json'}).end(buffers[index]);
      return;
    }
    const match = /^bytes=(\d+)-(\d+)$/.exec(request.headers.range||'');
    if (!match) {response.writeHead(400).end();return;}
    const start=Number(match[1]),end=Math.min(Number(match[2]),rasterBytes.length-1);
    response.writeHead(206,{'Content-Range':`bytes ${start}-${end}/${rasterBytes.length}`,'Content-Length':end-start+1}).end(rasterBytes.subarray(start,end+1));
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(()=>{server.closeAllConnections();server.close();});
  const url=`http://127.0.0.1:${server.address().port}`;
  const map={layers:[],addLayer(layer){this.layers.push(layer);},getView(){assert.fail('Geology must not change the map view');}};
  const manager=new LayerManager(map,[{...config,sourceUrl:url+'/background.tif',vectors:config.vectors.map((vector,index)=>({...vector,url:url+'/'+paths[index]}))}],MARS_CRS);
  await manager.loadConfigured();
  assert.equal(requests.size,0,'the large datasets must not be fetched until activation');
  const entry=manager.get('geology');
  const complete=new Promise((resolve,reject)=>{
    const listener=()=>{if(entry.layer){manager.removeEventListener('change',listener);resolve();}else if(entry.state==='error'){manager.removeEventListener('change',listener);reject(new Error(entry.error));}};
    manager.addEventListener('change',listener);
  });
  manager.setVisible('geology',true);
  manager.setVisible('geology',true);
  manager.setVisible('geology',false);
  await complete;
  const group=entry.layer;
  const children=group.getLayers().getArray();
  t.after(()=>{for(const layer of children){layer.getSource().dispose();layer.dispose();}group.dispose();});
  assert.equal(children.length,3);
  assert.equal(entry.state,'configured');
  assert.equal(children[1].getSource().getFeatures().length,113);
  assert.equal(children[2].getSource().getFeatures().length,1021);
  assert.equal(children[1].get('datasetName'),'Goudge geology');
  assert.equal(children[2].get('datasetName'),'USGS geology');
  const legend=group.get('legendDefinition');
  assert.deepEqual(legend.groups.map(group=>group.items.length),[17,14]);
  for (const [index,section] of legend.groups.entries()) {
    const cache=children[index+1].get('categoryStyles');
    for (const item of section.items) {
      const style=cache.get(item.label).style;
      assert.deepEqual(item.symbol.fill,style.getFill().getColor());
      assert.deepEqual(item.symbol.stroke,style.getStroke().getColor());
      assert.deepEqual(item.symbol.dash,style.getStroke().getLineDash());
    }
  }
  assert.ok(legend.groups[1].items.find(item=>item.label==='Njf').detail.includes('Jezero floor unit'));
  assert.ok(group.getExtent()[0]<config.extent[0],'retain the measured 21.75 m of Goudge geometry beyond the TIFF');
  assert.ok(Math.abs(group.getExtent()[0]-4328978.253932305)<0.001);
  assert.deepEqual(group.getLayerStatesArray().map(state=>[state.visible,state.zIndex]),[[false,5],[false,5],[false,5]]);
  manager.setVisible('geology',true);
  group.get('rasterSource').dispatchEvent('tileloadend');
  assert.equal(entry.state,'ready');
  assert.ok(group.getLayerStatesArray().every(state=>state.visible));
  assert.match(entry.config.legend,/Provisional/);
  assert.match(entry.config.legend,/No point POI/);
  manager.setVisible('geology',false);
  assert.ok(group.getLayerStatesArray().every(state=>!state.visible));
  manager.setVisible('geology',true);
  await manager.load('geology');
  assert.equal(map.layers.length,1);
  assert.equal(requests.get('/'+paths[0]),1);
  assert.equal(requests.get('/'+paths[1]),1);
});
