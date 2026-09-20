/**
 * 《龜兔賽跑 SEL 改編版》繪本電子書互動邏輯
 */

document.addEventListener('DOMContentLoaded', () => {
  const spreads = document.querySelectorAll('.book-spread');
  const paddleLeft = document.getElementById('paddleLeft');
  const paddleRight = document.getElementById('paddleRight');
  const btnStartReading = document.getElementById('btnStartReading');
  const btnReplayBook = document.getElementById('btnReplayBook');
  const curPageIndicator = document.getElementById('curPageIndicator');
  const footerPageTitle = document.getElementById('footerPageTitle');
  const footerDots = document.getElementById('footerDots');

  const btnTts = document.getElementById('btnTts');
  const btnRuby = document.getElementById('btnRuby');
  const btnSound = document.getElementById('btnSound');
  const btnFullscreen = document.getElementById('btnFullscreen');

  const totalPages = spreads.length;
  let currentPage = 0;
  let soundEnabled = true;
  let rubyEnabled = false; // 預設關閉注音，呈現最自然的完美字距！
  let isSpeaking = false;
  let synth = window.speechSynthesis;
  let currentUtterance = null;

  // =========================================================================
  // 1. Web Audio 原生紙張翻頁音效
  // =========================================================================
  let audioCtx = null;
  function playPageFlipSound() {
    if (!soundEnabled) return;
    try {
      if (!audioCtx) {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        audioCtx = new AudioContext();
      }
      if (audioCtx.state === 'suspended') {
        audioCtx.resume();
      }

      const bufferSize = audioCtx.sampleRate * 0.16;
      const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }

      const noise = audioCtx.createBufferSource();
      noise.buffer = buffer;

      const filter = audioCtx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(1300, audioCtx.currentTime);
      filter.frequency.exponentialRampToValueAtTime(360, audioCtx.currentTime + 0.16);
      filter.Q.setValueAtTime(2.2, audioCtx.currentTime);

      const gain = audioCtx.createGain();
      gain.gain.setValueAtTime(0.01, audioCtx.currentTime);
      gain.gain.linearRampToValueAtTime(0.28, audioCtx.currentTime + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.16);

      noise.connect(filter);
      filter.connect(gain);
      gain.connect(audioCtx.destination);
      noise.start();
    } catch (e) {}
  }

  function playChimeSound() {
    if (!soundEnabled) return;
    try {
      if (!audioCtx) {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        audioCtx = new AudioContext();
      }
      if (audioCtx.state === 'suspended') {
        audioCtx.resume();
      }
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(523.25, audioCtx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(1046.5, audioCtx.currentTime + 0.25);
      gain.gain.setValueAtTime(0.12, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.3);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.3);
    } catch (e) {}
  }

  // =========================================================================
  // 2. 翻頁與導覽邏輯
  // =========================================================================
  function renderFooterDots() {
    footerDots.innerHTML = '';
    spreads.forEach((spread, idx) => {
      const dot = document.createElement('div');
      dot.className = 'book-dot' + (idx === currentPage ? ' active' : '');
      dot.title = spread.getAttribute('data-title') || `第 ${idx} 頁`;
      dot.addEventListener('click', () => {
        goToPage(idx);
      });
      footerDots.appendChild(dot);
    });
  }

  function updateSpreadUI() {
    spreads.forEach((spread, idx) => {
      spread.classList.toggle('active', idx === currentPage);
    });

    const activeSpread = spreads[currentPage];
    const pageTitle = activeSpread.getAttribute('data-title') || `第 ${currentPage} 頁`;
    
    curPageIndicator.textContent = `第 ${currentPage + 1} 頁 / 共 ${totalPages} 頁`;
    footerPageTitle.textContent = pageTitle;

    const dots = footerDots.querySelectorAll('.book-dot');
    dots.forEach((dot, idx) => {
      dot.classList.toggle('active', idx === currentPage);
    });

    paddleLeft.style.opacity = currentPage === 0 ? '0.3' : '1';
    paddleLeft.style.pointerEvents = currentPage === 0 ? 'none' : 'auto';

    paddleRight.style.opacity = currentPage === totalPages - 1 ? '0.3' : '1';
    paddleRight.style.pointerEvents = currentPage === totalPages - 1 ? 'none' : 'auto';

    // 離開第五頁時自動暫停影片
    const video = document.getElementById('storyVideo');
    if (video && currentPage !== 5) {
      video.pause();
    }
  }

  function goToPage(target) {
    if (target < 0 || target >= totalPages || target === currentPage) return;
    stopSpeech();
    currentPage = target;
    playPageFlipSound();
    updateSpreadUI();
  }

  paddleLeft.addEventListener('click', () => goToPage(currentPage - 1));
  paddleRight.addEventListener('click', () => goToPage(currentPage + 1));

  if (btnStartReading) {
    btnStartReading.addEventListener('click', () => goToPage(1));
  }
  if (btnReplayBook) {
    btnReplayBook.addEventListener('click', () => goToPage(0));
  }

  // 鍵盤左右鍵快捷翻頁
  window.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT') return;
    if (e.key === 'ArrowLeft') paddleLeft.click();
    if (e.key === 'ArrowRight') paddleRight.click();
    if (e.key === ' ') {
      e.preventDefault();
      speakCurrentPage();
    }
  });

  // =========================================================================
  // 3. 語音朗讀 TTS (Web Speech API)
  // =========================================================================
  function speakCurrentPage() {
    if (!('speechSynthesis' in window)) {
      alert('您的瀏覽器不支援語音朗讀功能');
      return;
    }

    if (isSpeaking) {
      stopSpeech();
      return;
    }

    const activeSpread = spreads[currentPage];
    const textBody = activeSpread.querySelector('.story-text-body');
    let textToSpeak = '';

    if (textBody) {
      textToSpeak = textBody.getAttribute('data-speech') || textBody.innerText;
    } else if (currentPage === 0) {
      textToSpeak = '龜兔賽跑，SEL改編版。在森林這場精彩的賽跑裡，兔子學會了認錯與感恩，烏龜展現了冷靜與同理心。比獨自贏得第一名更耀眼的，是懂得在夥伴跌倒時伸出溫暖的手！請按下方按鈕翻開繪本開始閱讀！';
    } else if (currentPage === 5) {
      textToSpeak = '恭喜完成這趟森林閱讀旅程！請欣賞3D微動畫，並記住冷靜深呼吸、一步一步來，以及同理與真誠道歉三大法寶！';
    }

    if (!textToSpeak.trim()) return;

    currentUtterance = new SpeechSynthesisUtterance(textToSpeak);
    currentUtterance.lang = 'zh-TW';
    currentUtterance.rate = 0.88;
    currentUtterance.pitch = 1.05;

    const voices = synth.getVoices();
    const twVoice = voices.find(v => v.lang.includes('zh-TW') || v.name.includes('Yating') || v.name.includes('Meijia') || v.name.includes('Han') || v.lang.includes('cmn'));
    if (twVoice) currentUtterance.voice = twVoice;

    if (textBody) textBody.classList.add('reading-highlight');

    currentUtterance.onstart = () => {
      isSpeaking = true;
      btnTts.classList.add('speaking');
      btnTts.innerHTML = '<span class="icon">⏹️</span><span class="txt">停止朗讀</span>';
    };

    currentUtterance.onend = stopSpeech;
    currentUtterance.onerror = stopSpeech;

    synth.speak(currentUtterance);
  }

  function stopSpeech() {
    if (synth && synth.speaking) {
      synth.cancel();
    }
    isSpeaking = false;
    btnTts.classList.remove('speaking');
    btnTts.innerHTML = '<span class="icon">🔊</span><span class="txt">朗讀故事</span>';
    document.querySelectorAll('.story-text-body').forEach(c => c.classList.remove('reading-highlight'));
  }

  btnTts.addEventListener('click', speakCurrentPage);

  // =========================================================================
  // 4. 注音開關、音效開關、全螢幕
  // =========================================================================
  btnRuby.addEventListener('click', () => {
    rubyEnabled = !rubyEnabled;
    document.body.classList.toggle('ruby-on', rubyEnabled);
    document.body.classList.toggle('ruby-off', !rubyEnabled);
    btnRuby.classList.toggle('active', rubyEnabled);
    btnRuby.innerHTML = `<span class="icon">🔤</span><span class="txt">注音: ${rubyEnabled ? '開' : '關'}</span>`;
  });

  btnSound.addEventListener('click', () => {
    soundEnabled = !soundEnabled;
    btnSound.classList.toggle('active', soundEnabled);
    btnSound.innerHTML = `<span class="icon">🎵</span><span class="txt">音效: ${soundEnabled ? '開' : '關'}</span>`;
  });

  btnFullscreen.addEventListener('click', () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  });

  // =========================================================================
  // 5. 證書頒發與粒子特效
  // =========================================================================
  function spawnSparkles(x, y) {
    const emojis = ['⭐', '💖', '✨', '🎉', '🐢', '🐰'];
    for (let i = 0; i < 8; i++) {
      const p = document.createElement('div');
      p.className = 'sparkle-node';
      p.textContent = emojis[Math.floor(Math.random() * emojis.length)];
      p.style.fontSize = (18 + Math.random() * 12) + 'px';
      p.style.left = x + 'px';
      p.style.top = y + 'px';

      const angle = Math.random() * Math.PI * 2;
      const dist = 50 + Math.random() * 70;
      const dx = Math.cos(angle) * dist;
      const dy = Math.sin(angle) * dist - 30;

      p.style.setProperty('--dx', `${dx}px`);
      p.style.setProperty('--dy', `${dy}px`);

      document.body.appendChild(p);
      setTimeout(() => p.remove(), 1200);
    }
  }

  const btnGetCert = document.getElementById('btnGetCert');
  const certStudentName = document.getElementById('certStudentName');
  const certOutputBox = document.getElementById('certOutputBox');
  if (btnGetCert && certStudentName && certOutputBox) {
    btnGetCert.addEventListener('click', () => {
      const name = certStudentName.value.trim() || '熱心小英雄';
      playChimeSound();
      const rect = btnGetCert.getBoundingClientRect();
      spawnSparkles(rect.left + rect.width / 2, rect.top);
      certOutputBox.style.display = 'block';
      certOutputBox.innerHTML = `🎉 恭喜 <strong>${name}</strong> 同學！<br>你成功領悟了「深呼吸冷靜」、「一步一步來」與「同理關懷他人」，獲頒 <strong>SEL 情緒小勇士</strong> 榮譽勳章！🎖️`;
    });
  }

  // 初始化
  renderFooterDots();
  updateSpreadUI();
});
