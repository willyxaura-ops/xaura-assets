/**
 * xaura-voice.js v2.0 - XAURA AI OS Voice Layer
 * ================================================
 * ONE floating mic button. Opens CRM chat + injects STT text via shadow DOM.
 * No duplicates, no cross-origin issues.
 *
 * HOW IT WORKS:
 *   1. Floating gold mic button (44px, bottom-right above CRM widget)
 *   2. Click -> openWidget() via leadConnector API -> start Web Speech STT
 *   3. On final speech result -> inject text into CRM shadow DOM textarea -> send
 *   4. Bot response -> TTS reads aloud
 *
 * BROWSERS: Chrome/Edge/Android OK | iOS Safari 14.5+ OK | Firefox: shows error, chat still works
 */
(function(){
  'use strict';

  // Guard: run only once even if script loaded twice
  if(window.__xauraVoiceLoaded) return;
  window.__xauraVoiceLoaded = true;

  var V = window.XauraVoice || {};
  var lang = V.lang || 'es';
  var primary = (V.theme || {}).primary || '#D4AF37';
  var T = {
    mic:       lang==='en' ? 'Speak'         : 'Hablar',
    stop:      lang==='en' ? 'Stop'          : 'Detener',
    listening: lang==='en' ? 'Listening...'  : 'Escuchando...',
    noSupport: lang==='en' ? 'Use Chrome/Edge for voice' : 'Usa Chrome o Edge para la voz',
    noMic:     lang==='en' ? 'Mic denied. Enable in browser settings.' : 'Microfono denegado. Activalo en ajustes.'
  };
  var LANG_CODE = lang==='en' ? 'en-US' : lang==='fr' ? 'fr-FR' : 'es-ES';
  var VOICE_OK = (function(){
    try{ return !!(window.SpeechRecognition || window.webkitSpeechRecognition); }
    catch(e){ return false; }
  })();
  var synth = (function(){
    try{ return window.speechSynthesis || null; }catch(e){ return null; }
  })();
  var recognition = null;
  var voiceActive = false;
  var lastBotText = '';

  // ââ Text-to-Speech ââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
  function speak(txt) {
    if(!synth) return;
    synth.cancel();
    var u = new SpeechSynthesisUtterance(txt);
    u.lang = LANG_CODE; u.rate = 0.95; u.volume = 0.9;
    synth.speak(u);
  }

  // ââ Shadow DOM recursive search ââââââââââââââââââââââââââââââââââââââââââââ
  function findDeep(root, selector) {
    var found = Array.from(root.querySelectorAll(selector));
    Array.from(root.querySelectorAll('*')).forEach(function(el){
      if(el.shadowRoot) found = found.concat(findDeep(el.shadowRoot, selector));
    });
    return found;
  }

  // ââ Open CRM chat widget âââââââââââââââââââââââââââââââââââââââââââââââââââ
  function openChatWidget() {
    try {
      if(window.leadConnector && window.leadConnector.chatWidget) {
        window.leadConnector.chatWidget.openWidget();
        return;
      }
    } catch(e) {}
    // Fallback: click the chat bubble
    var sels = ['[class*="chat-bubble"]','[aria-label*="chat" i]','chat-widget'];
    for(var i=0;i<sels.length;i++){
      var b = document.querySelector(sels[i]);
      if(b){ b.click(); return; }
    }
  }

  // ââ Inject text into CRM widget textarea âââââââââââââââââââââââââââââââââââ
  function sendToWidget(text) {
    var chatEl = document.querySelector('chat-widget');
    var sr = chatEl && chatEl.shadowRoot;
    if(!sr) {
      // Widget not open yet â open and retry
      openChatWidget();
      setTimeout(function(){ sendToWidget(text); }, 1000);
      return;
    }

    var inputs = findDeep(sr, 'textarea[placeholder*="mensaje"], textarea[placeholder*="message"], textarea[id*="ion-textarea"]');
    var inp = inputs[0];
    if(!inp) {
      setTimeout(function(){ sendToWidget(text); }, 500);
      return;
    }

    // Set value via React/Ionic native setter
    inp.focus();
    try {
      var setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value');
      if(setter && setter.set) setter.set.call(inp, text);
      else inp.value = text;
    } catch(e) { inp.value = text; }
    inp.dispatchEvent(new Event('input',  {bubbles:true}));
    inp.dispatchEvent(new Event('change', {bubbles:true}));

    // Click send button
    setTimeout(function(){
      var sendBtns = findDeep(sr, 'button[type="submit"], button[class*="send"], button[aria-label*="send"], button[aria-label*="enviar"]');
      if(sendBtns[0]){
        sendBtns[0].click();
      } else {
        // Fallback: Enter key
        inp.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',keyCode:13,bubbles:true}));
        inp.dispatchEvent(new KeyboardEvent('keyup',  {key:'Enter',keyCode:13,bubbles:true}));
      }
    }, 120);
  }

  // ââ Watch for bot replies and read aloud âââââââââââââââââââââââââââââââââââ
  function watchBot() {
    var chatEl = document.querySelector('chat-widget');
    if(!chatEl || !chatEl.shadowRoot) {
      setTimeout(watchBot, 1000);
      return;
    }
    function observe(root) {
      new MutationObserver(function(){
        var msgs = findDeep(root, '[class*="bot-message"],[class*="agent-message"],[class*="received"],[class*="bot_message"],[class*="incoming"]');
        if(!msgs.length) return;
        var t = msgs[msgs.length-1].textContent.trim();
        if(t && t !== lastBotText && t.length > 5) { lastBotText=t; speak(t); }
      }).observe(root, {childList:true, subtree:true});
    }
    observe(chatEl.shadowRoot);
    // Re-watch if new shadow roots appear
    new MutationObserver(function(){
      var newShadows = Array.from(document.querySelectorAll('*')).filter(function(e){ return e.shadowRoot && !e.dataset.xWatched; });
      newShadows.forEach(function(e){ e.dataset.xWatched='1'; observe(e.shadowRoot); });
    }).observe(document.body, {childList:true, subtree:true});
  }

  // ââ STT Recognition ââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
  function newRec() {
    var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    var r = new SR();
    r.lang = LANG_CODE; r.interimResults = false; r.maxAlternatives = 1; r.continuous = true;
    return r;
  }

  // ââ Mic button âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
  function createBtn() {
    // Inject styles
    var st = document.createElement('style');
    st.textContent = [
      '#xaura-voice-btn{position:fixed;bottom:88px;right:20px;z-index:10000;',
        'background:'+primary+';color:#111;border:none;border-radius:28px;',
        'padding:10px 16px;font-size:13px;font-weight:600;font-family:system-ui,sans-serif;',
        'cursor:pointer;display:flex;align-items:center;gap:7px;',
        'box-shadow:0 4px 16px rgba(0,0,0,.35);min-width:44px;min-height:44px;',
        'transition:transform .15s,background .15s}',
      '#xaura-voice-btn:hover{transform:scale(1.06)}',
      '#xaura-voice-btn.listening{background:#ef4444;color:#fff;animation:xvp 1.2s infinite}',
      '@keyframes xvp{0%,100%{box-shadow:0 4px 16px rgba(239,68,68,.4)}50%{box-shadow:0 4px 24px rgba(239,68,68,.7)}}',
      '@media(max-width:480px){#xaura-voice-btn{bottom:80px;right:16px;padding:12px 14px}',
        '#xaura-voice-label{display:none}}'
    ].join('');
    document.head.appendChild(st);

    var btn = document.createElement('button');
    btn.id = 'xaura-voice-btn';
    btn.setAttribute('aria-label', VOICE_OK ? T.mic : T.noSupport);
    btn.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M12 14a3 3 0 003-3V5a3 3 0 00-6 0v6a3 3 0 003 3zm5-3a5 5 0 01-10 0H5a7 7 0 0014 0h-2zm-5 9v-2a7 7 0 007-7h-2a5 5 0 01-10 0H5a7 7 0 007 7v2h-3v2h8v-2h-3z"/></svg>'
                  + '<span id="xaura-voice-label">' + T.mic + '</span>';
    document.body.appendChild(btn);

    // No voice support
    if(!VOICE_OK) {
      btn.style.opacity = '0.55';
      btn.addEventListener('click', function(){
        var d = document.createElement('div');
        d.style.cssText = 'position:fixed;bottom:148px;right:20px;z-index:10001;background:#1a1a1a;color:#fff;padding:12px 16px;border-radius:12px;font-size:13px;max-width:220px;font-family:system-ui,sans-serif;box-shadow:0 4px 12px rgba(0,0,0,.5)';
        d.textContent = /firefox/i.test(navigator.userAgent) ? 'Firefox no soporta voz. Usa Chrome.' : T.noSupport;
        document.body.appendChild(d);
        setTimeout(function(){ d.remove(); }, 4000);
      });
      return btn;
    }

    // Voice button click handler
    btn.addEventListener('click', function(){
      if(voiceActive) {
        recognition && recognition.stop();
        voiceActive = false;
        btn.classList.remove('listening');
        btn.setAttribute('aria-label', T.mic);
        document.getElementById('xaura-voice-label').textContent = T.mic;
        return;
      }
      // Open chat first, then start STT
      openChatWidget();
      recognition = newRec();

      recognition.onstart = function(){
        voiceActive = true;
        btn.classList.add('listening');
        btn.setAttribute('aria-label', T.stop);
        document.getElementById('xaura-voice-label').textContent = T.listening;
      };

      recognition.onresult = function(e){
        var txt = '';
        for(var i = e.resultIndex; i < e.results.length; i++){
          if(e.results[i].isFinal) txt += e.results[i][0].transcript;
        }
        if(txt){ sendToWidget(txt); recognition.stop(); }
      };

      recognition.onend = function(){
        voiceActive = false;
        btn.classList.remove('listening');
        btn.setAttribute('aria-label', T.mic);
        document.getElementById('xaura-voice-label').textContent = T.mic;
      };

      recognition.onerror = function(e){
        voiceActive = false;
        btn.classList.remove('listening');
        document.getElementById('xaura-voice-label').textContent = T.mic;
        if(e.error === 'not-allowed'){
          var d = document.createElement('div');
          d.style.cssText = 'position:fixed;bottom:148px;right:20px;z-index:10001;background:#1a1a1a;color:#fff;padding:12px 16px;border-radius:12px;font-size:13px;max-width:220px;font-family:system-ui,sans-serif';
          d.textContent = T.noMic;
          document.body.appendChild(d);
          setTimeout(function(){ d.remove(); }, 5000);
        }
      };

      try{ recognition.start(); } catch(e){}
    });

    return btn;
  }

  // ââ Init âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
  function init() {
    if(document.getElementById('xaura-voice-btn')) return;
    createBtn();
    setTimeout(watchBot, 2000);
  }

  if(document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', init);
  else
    setTimeout(init, 100);

  window.XauraVoice = window.XauraVoice || {};
  window.XauraVoice.speak = speak;
  window.XauraVoice.sendToWidget = sendToWidget;
})();
