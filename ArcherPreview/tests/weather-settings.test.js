import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {Color3} from '@babylonjs/core';
import {setupWeatherSettings,WEATHER_KEY} from '../src/weather-settings.js';

test('outdoor weather changes existing fog and sky, restores defaults and never affects cave fog',()=>{
 const {document,window}=parseHTML('<main></main>');Object.defineProperty(window.HTMLSelectElement.prototype,'value',{configurable:true,get(){return this.getAttribute('data-value')??'clear';},set(v){this.setAttribute('data-value',v);}});
 const storage=new Map(),host=document.querySelector('main'),material={setFloat(name,value){this[name]=value;}},world={mapId:'village',cave:false,scene:{fogStart:88,fogEnd:105,fogColor:new Color3(.3,.4,.2)},sky:{material}},settings=setupWeatherSettings({host,storage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)},getWorld:()=>world});
 settings.mapChanged();const select=host.querySelector('select');select.value='fog';select.dispatchEvent(new window.Event('change'));assert.equal(world.scene.fogStart,22);assert.equal(world.scene.fogEnd,65);assert.equal(material.weatherCloud,.55);assert.equal(storage.get(WEATHER_KEY),'fog');
 select.value='clear';select.dispatchEvent(new window.Event('change'));assert.equal(world.scene.fogStart,88);assert.equal(world.scene.fogEnd,105);
 world.cave=true;world.mapId='witch-cave';world.scene.fogStart=22;world.scene.fogEnd=48;settings.mapChanged();select.value='fog';select.dispatchEvent(new window.Event('change'));assert.equal(world.scene.fogEnd,48);assert.equal(material.weatherCloud,0);settings.dispose();
});
