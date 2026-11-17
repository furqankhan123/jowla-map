/** First-run walkthrough: dimmed overlay, spotlight on a target, Next/Skip. Replay from Route settings. */
(function () {
  var KEY = 'jowla-tour-done';
  var STEPS = [
    { sel: '#filter-fab', title: 'Filters', text: 'Choose a city, status or name so only the stops you want are shown.' },
    { sel: '#cluster-fab', title: 'Suggest clusters', text: 'Finds dense groups of unvisited stops near you. Tap one to optimize it.' },
    { sel: '#optimize-fab', title: 'Optimize', text: 'Builds a short route of nearby unvisited stops (about an hour) starting from where you are.' },
    { sel: '#route-panel.visible', title: 'Your route', text: 'Tap Go to navigate to a stop and Log to record the visit. The circle marks a stop done. The route ends back at your start unless you set a different end point at the bottom.', optional: true },
    { sel: null, title: 'Maps app', text: 'Pick Google or Apple Maps under Route settings. Apple Maps shows multi-stop routes as an overview: tap Steps, or use the Go buttons on each stop to navigate one stop at a time.' }
  ];
  var idx = 0, overlay, ring, card;

  function done() { try { localStorage.setItem(KEY, '1'); } catch (e) {} }
  function seen() { try { return localStorage.getItem(KEY) === '1'; } catch (e) { return true; } }
  function steps() { return STEPS.filter(function (s) { return !s.sel || document.querySelector(s.sel) || !s.optional; }); }

  function close() {
    done();
    [overlay, ring, card].forEach(function (n) { if (n && n.parentNode) n.parentNode.removeChild(n); });
    overlay = ring = card = null;
    window.removeEventListener('resize', place);
  }
  function place() {
    if (!card) return;
    var list = steps(), st = list[idx];
    var el = st.sel ? document.querySelector(st.sel) : null;
    if (el) {
      overlay.style.background = 'transparent';
      var r = el.getBoundingClientRect(), pad = 6;
      ring.style.cssText = 'display:block;left:' + (r.left - pad) + 'px;top:' + (r.top - pad) + 'px;width:' + (r.width + pad * 2) + 'px;height:' + (r.height + pad * 2) + 'px';
      var below = r.top < window.innerHeight / 2;
      card.style.top = below ? Math.min(r.bottom + 16, window.innerHeight - 220) + 'px' : 'auto';
      card.style.bottom = below ? 'auto' : Math.max(window.innerHeight - r.top + 16, 16) + 'px';
    } else {
      ring.style.display = 'none'; overlay.style.background = 'rgba(0,0,0,.6)';
      card.style.top = '30%'; card.style.bottom = 'auto';
    }
  }
  function render() {
    var list = steps(), st = list[idx];
    card.innerHTML = '<div class="tour-title">' + st.title + '</div><div class="tour-text">' + st.text + '</div>' +
      '<div class="tour-btns"><button type="button" class="tour-skip">Skip</button>' +
      '<span class="tour-count">' + (idx + 1) + '/' + list.length + '</span>' +
      '<button type="button" class="tour-next">' + (idx === list.length - 1 ? 'Done' : 'Next') + '</button></div>';
    card.querySelector('.tour-skip').addEventListener('click', close);
    card.querySelector('.tour-next').addEventListener('click', function () {
      if (idx >= list.length - 1) close(); else { idx++; render(); }
    });
    place();
  }
  function start(force) {
    if (overlay || (!force && seen())) return;
    idx = 0;
    overlay = document.createElement('div'); overlay.id = 'tour-overlay';
    ring = document.createElement('div'); ring.id = 'tour-ring';
    card = document.createElement('div'); card.id = 'tour-card';
    document.body.appendChild(overlay); document.body.appendChild(ring); document.body.appendChild(card);
    window.addEventListener('resize', place);
    render();
  }
  window.startTour = function () { start(true); };
  window.addEventListener('load', function () { setTimeout(function () { start(false); }, 1500); });
})();
