import { ADS_SETTINGS } from '../src/setting.ts';
import { defaultAdPlatformSettings } from '../src/ad-platform-contract.ts';

// 通用界面门禁只检查奖励页的原有占位与取消，不依赖站长随时修改的线上库存。
// 真实图片、分端投放和观看领取由广告专项浏览器验证覆盖。
export const UI_AD_FIXTURE = `{
  const settingsUrl=new URL(${JSON.stringify(ADS_SETTINGS.platform.endpoint)}),
    adUrl=new URL(${JSON.stringify(ADS_SETTINGS.house.endpoint)}),
    preloadPath=new URL(${JSON.stringify(ADS_SETTINGS.house.preloadEndpoint)}).pathname,
    original=window.fetch.bind(window);
  window.__uiAdFixtureRequests=[];
  window.fetch=(input,init)=>{
    const url=new URL(input instanceof Request?input.url:String(input),location.href);
    if((init?.method??(input instanceof Request?input.method:'GET'))==='GET'&&
      url.origin===settingsUrl.origin&&[settingsUrl.pathname,adUrl.pathname,preloadPath].includes(url.pathname)){
      window.__uiAdFixtureRequests.push({path:url.pathname,query:url.search});
      return Promise.resolve(Response.json(url.pathname===settingsUrl.pathname?
        {settings:${JSON.stringify(defaultAdPlatformSettings())}}:url.pathname===preloadPath?{images:[]}:{ad:null}));
    }
    return original(input,init);
  };
}`;
