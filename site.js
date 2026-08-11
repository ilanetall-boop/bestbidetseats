/* Best Bidet Seats - site.js: analytics + outbound amazon click tracking.
   Set window.GA_ID (e.g. G-XXXXXXX) below when the GA4 property exists; until then this is inert. */
(function(){
  var GA_ID = null; // <- paste G-XXXX here to activate GA4
  if(GA_ID){
    var s=document.createElement("script");s.async=true;s.src="https://www.googletagmanager.com/gtag/js?id="+GA_ID;document.head.appendChild(s);
    window.dataLayer=window.dataLayer||[];window.gtag=function(){dataLayer.push(arguments);};gtag("js",new Date());gtag("config",GA_ID);
  }
  document.addEventListener("click",function(e){
    var a=e.target.closest&&e.target.closest("a[href*=amazon]");
    if(!a)return;
    if(window.gtag){gtag("event","amazon_click",{link_url:a.href,link_text:(a.textContent||"").trim().slice(0,60),page_path:location.pathname});}
  },{capture:true,passive:true});
})();