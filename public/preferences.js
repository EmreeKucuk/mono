export const defaults={gridMode:'manual',minWidgetWidth:280,widgetScale:1,resizeWidgets:true,clipboardCloud:false,clipboardDays:3,overlayWidth:420,overlayHeight:520};
export function preferences(value={}){
  const clamp=(key,min,max)=>Math.max(min,Math.min(max,Number(value[key])||defaults[key]));
  return {gridMode:value.gridMode==='auto'?'auto':'manual',minWidgetWidth:clamp('minWidgetWidth',240,480),widgetScale:clamp('widgetScale',.75,1.5),resizeWidgets:value.resizeWidgets!==false,clipboardCloud:value.clipboardCloud===true,clipboardDays:[0,1,3,7,30].includes(value.clipboardDays)?value.clipboardDays:3,overlayWidth:clamp('overlayWidth',280,1000),overlayHeight:clamp('overlayHeight',240,1000)};
}
export function adaptiveColumns(width,minWidth=280){return Math.max(2,Math.min(6,Math.floor((width+16)/(minWidth+16))));}
