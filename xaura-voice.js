/**
 * xaura-voice.js - Voice layer for XAURA AI OS v1.0
 * Adds voice (STT + TTS) to the CRM chat widget.
 * No custom chat UI - just enhances CRM widget with mic + TTS.
 *
 * INTEGRATION (in index.html before </body>):
 *   <script>window.XauraVoice={siteId:'sevi',leader:{shortName:'Sevi'},
 *   whatsapp:{number:'34618394533',message:'Hola Sevi'},lang:'es',theme:{primary:'#D4AF37'}};</script>
 *   <script src="https://widgets.leadconnectorhq.com/loader.js"
 *     data-resources-url="https://widgets.leadconnectorhq.com/chat-widget/loader.js"
 *     data-widget-id="6a8efbc5d45d62178f3ec21f"></script>
 *   <script src="https://cdn.jsdelivr.net/gh/willyxaura-ops/xaura-assets@main/xaura-voice.js" defer></script>
 *
 * BROWSERS: Chrome/Edge/Android OK | iOS Safari 14.5+ OK | Firefox (shows error, does not block chat)
 */
(function(){
  'use strict';
  var V=window.XauraVoice||{};
  var lang=V.lang||'es';
  var primary=(V.theme||{}).primary||'#D4AF37';
  var T={
    mic: lang==='en'?'Speak':'Hablar',
    stop: lang==='en'?'Stop':'Detener',
    listening: lang==='en'?'Listening...':'Escuchando...',
    noSupport: lang==='en'?'Use Chrome or Edge':'Usa Chrome o Edge',
    noMic: lang==='en'?'Microphone denied. Enable in browser settings.':'Microfono denegado. Activalo en ajustes.'
  };
  var LANG_CODE=lang==='en'?'en-US':lang==='fr'?'fr-FR':'es-ES';
  var VOICE_OK=(function(){try{return !!(window.SpeechRecognition||window.webkitSpeechRecognition);}catch(e){return false;}})();
  var synth=(function(){try{return window.speechSynthesis||null;}catch(e){return null;}})();
  var recognition=null;
  var voiceActive=false;
  var lastBotText='';

  function speak(txt){
    if(!synth)return;
    synth.cancel();
    var u=new SpeechSynthesisUtterance(txt);
    u.lang=LANG_CODE; u.rate=0.95; u.volume=0.9;
    synth.speak(u);
  }

  function newRec(){
    var SR=window.SpeechRecognition||window.webkitSpeechRecognition;
    var r=new SR();
    r.lang=LANG_CODE; r.interimResults=false; r.maxAlternatives=1; r.continuous=true;
    return r;
  }

  function openWidget(){
    var sels=['[class*="chat-bubble"]','[aria-label*="chat" i]','[aria-label*="widget" i]'];
    for(var i=0;i<sels.length;i++){var b=document.querySelector(sels[i]);if(b){b.click();return;}}
    document.querySelectorAll('*').forEach(function(h){
      if(h.shadowRoot)sels.forEach(function(s){var e=h.shadowRoot.querySelector(s);if(e)e.click();});
    });
  }

  function sendToChat(text){
    var sels=['textarea[placeholder]','input[type="text"][placeholder]','[contenteditable="true"]'];
    var inp=null,inSh=false;
    for(var i=0;i<sels.length;i++){
      var el=document.querySelector(sels[i]);
      if(el&&el.closest('[id*="chat"],[class*="chat"],[id*="widget"],[class*="widget"]')){inp=el;break;}
    }
    if(!inp){
      document.querySelectorAll('*').forEach(function(h){
        if(!h.shadowRoot||inp)return;
        for(var i=0;i<sels.length;i++){var e=h.shadowRoot.querySelector(sels[i]);if(e){inp=e;inSh=true;break;}}
      });
    }
    if(!inp){openWidget();setTimeout(function(){sendToChat(text);},800);return;}
    inp.focus();
    try{
      var s=Object.getOwnPropertyDescriptor(inSh?inp.__proto__:window.HTMLTextAreaElement.prototype,'value');
      if(s&&s.set)s.set.call(inp,text);else inp.value=text;
    }catch(e){inp.value=text;}
    inp.dispatchEvent(new Event('input',{bubbles:true}));
    inp.dispatchEvent(new Event('change',{bubbles:true}));
    setTimeout(function(){
      inp.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',keyCode:13,bubbles:true}));
      inp.dispatchEvent(new KeyboardEvent('keyup',{key:'Enter',keyCode:13,bubbles:true}));
    },100);
  }

  function watchBot(){
    function obs(root){
      new MutationObserver(function(){
        var msgs=root.querySelectorAll('[class*="bot-message"],[class*="agent-message"],[class*="received"]');
        if(!msgs.length)return;
        var t=msgs[msgs.length-1].textContent.trim();
        if(t&&t!==lastBotText&&t.length>5){lastBotText=t;speak(t);}
      }).observe(root,{childList:true,subtree:true});
    }
    obs(document.body);
    document.querySelectorAll('*').forEach(function(h){if(h.shadowRoot)obs(h.shadowRoot);});
    new MutationObserver(function(){
      document.querySelectorAll('*').forEach(function(h){
        if(h.shadowRoot&&!h.dataset.xauraWatched){h.dataset.xauraWatched='1';obs(h.shadowRoot);}
      });
    }).observe(document.body,{childList:true,subtree:true});
  }

  function createBtn(){
    var btn=document.createElement('button');
    btn.id='xaura-voice-btn';
    btn.setAttribute('aria-label',VOICE_OK?T.mic:T.noSupport);
    btn.innerHTML='<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M12 14a3 3 0 003-3V5a3 3 0 00-6 0v6a3 3 0 003 3zm5-3a5 5 0 01-10 0H5a7 7 0 0014 0h-2zm-5 9v-2a7 7 0 007-7h-2a5 5 0 01-10 0H5a7 7 0 007 7v2h-3v2h8v-2h-3z"/></svg><span id="xaura-voice-label">'+T.mic+'</span>';
    var st=document.createElement('style');
    st.textContent='#xaura-voice-btn{position:fixed;bottom:88px;right:20px;z-index:10000;background:'+primary+';color:#111;border:none;border-radius:28px;padding:10px 16px;font-size:13px;font-weight:600;font-family:system-ui,sans-serif;cursor:pointer;display:flex;align-items:center;gap:7px;box-shadow:0 4px 16px rgba(0,0,0,.3);min-width:44px;min-height:44px;transition:transform .15s,background .15s}#xaura-voice-btn:hover{transform:scale(1.06)}#xaura-voice-btn.listening{background:#ef4444;color:#fff;animation:xaura-pulse 1.2s infinite}@keyframes xaura-pulse{0%,100%{box-shadow:0 4px 16px rgba(239,68,68,.4)}50%{box-shadow:0 4px 24px rgba(239,68,68,.7)}}@media(max-width:480px){#xaura-voice-btn{bottom:80px;right:16px;padding:12px 16px}#xaura-voice-label{display:none}}';
    document.head.appendChild(st);
    document.body.appendChild(btn);
    if(!VOICE_OK){
      btn.style.opacity='0.6';
      btn.addEventListener('click',function(){
        var d=document.createElement('div');
        d.style.cssText='position:fixed;bottom:148px;right:20px;z-index:10001;background:#1a1a1a;color:#fff;padding:12px 16px;border-radius:12px;font-size:13px;max-width:240px;font-family:system-ui,sans-serif';
        var ua=navigator.userAgent;
        d.textContent=/firefox/i.test(ua)?'Firefox no soporta voz. Usa Chrome o Edge.':/iphone|ipad/i.test(ua)?'Activa microfono en Safari iOS 14.5+.':T.noSupport;
        document.body.appendChild(d);setTimeout(function(){d.remove();},4000);
      });
      return btn;
    }
    btn.addEventListener('click',function(){
      if(voiceActive){
        recognition&&recognition.stop();
        voiceActive=false;btn.classList.remove('listening');
        btn.setAttribute('aria-label',T.mic);
        document.getElementById('xaura-voice-label').textContent=T.mic;
        return;
      }
      openWidget();
      recognition=newRec();
      recognition.onstart=function(){voiceActive=true;btn.classList.add('listening');btn.setAttribute('aria-label',T.stop);document.getElementById('xaura-voice-label').textContent=T.listening;};
      recognition.onresult=function(e){
        var txt='';
        for(var i=e.resultIndex;i<e.results.length;i++){
          if(e.results[i].isFinal) txt+=e.results[i][0].transcript;
        }
        if(txt){sendToChat(txt);recognition.stop();}
      };
      recognition.onend=function(){voiceActive=false;btn.classList.remove('listening');btn.setAttribute('aria-label',T.mic);document.getElementById('xaura-voice-label').textContent=T.mic;};
      recognition.onerror=function(e){
        voiceActive=false;btn.classList.remove('listening');
        document.getElementById('xaura-voice-label').textContent=T.mic;
        if(e.error==='not-allowed'){
          var d=document.createElement('div');
          d.style.cssText='position:fixed;bottom:148px;right:20px;z-index:10001;background:#1a1a1a;color:#fff;padding:12px 16px;border-radius:12px;font-size:13px;max-width:240px;font-family:system-ui,sans-serif';
          d.textContent=T.noMic;document.body.appendChild(d);setTimeout(function(){d.remove();},5000);
        }
      };
      try{recognition.start();}catch(e){}
    });
    return btn;
  }

  function init(){
    if(document.getElementById('xaura-voice-btn'))return;
    createBtn();
    watchBot();
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);
  else setTimeout(init,100);

  window.XauraVoice=window.XauraVoice||{};
  window.XauraVoice.speak=speak;
})();
