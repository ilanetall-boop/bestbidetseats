/* Best Bidet Seats - site.js: analytics + outbound amazon click tracking.
   Ids come from data/blogs-registry.json via scripts/premium-analytics-sync.js — do not hand-edit. */
(function(){
  var GA_ID = "G-KFYYMEPDP7";
  var CLARITY_ID = "y1k82rg4ot";
  if(GA_ID){
    var s=document.createElement("script");s.async=true;s.src="https://www.googletagmanager.com/gtag/js?id="+GA_ID;document.head.appendChild(s);
    window.dataLayer=window.dataLayer||[];window.gtag=function(){dataLayer.push(arguments);};gtag("js",new Date());gtag("config",GA_ID);
  }
  if(CLARITY_ID){
    (function(c,l,a,r,i,t,y){c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);})(window,document,"clarity","script",CLARITY_ID);
  }
  document.addEventListener("click",function(e){
    var a=e.target.closest&&e.target.closest("a[href*=amazon]");
    if(!a)return;
    if(window.gtag){gtag("event","amazon_click",{link_url:a.href,link_text:(a.textContent||"").trim().slice(0,60),page_path:location.pathname});}
  },{capture:true,passive:true});
})();