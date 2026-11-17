/** Shared navigation URL helpers (Google + Apple Maps) and the preferred-app setting. */
(function () {
  var PREF_KEY = 'jowla-nav-pref';

  function navPref() {
    try { return localStorage.getItem(PREF_KEY) === 'apple' ? 'apple' : 'google'; } catch (e) { return 'google'; }
  }
  function setNavPref(v) {
    try { localStorage.setItem(PREF_KEY, v === 'apple' ? 'apple' : 'google'); } catch (e) {}
  }
  function navLinks(lat, lng) {
    return {
      apple: 'https://maps.apple.com/?daddr=' + lat + ',' + lng + '&dirflg=d',
      google: 'https://www.google.com/maps/dir/?api=1&destination=' + lat + ',' + lng
    };
  }
  /** {primary:{app,label,url}, other:{app,label,url}} ordered by the user's preference. */
  function navButtons(lat, lng) {
    var l = navLinks(lat, lng);
    var pref = navPref();
    var info = {
      apple: { app: 'apple', label: 'Apple Maps', url: l.apple },
      google: { app: 'google', label: 'Google Maps', url: l.google }
    };
    return { primary: info[pref], other: info[pref === 'apple' ? 'google' : 'apple'] };
  }

  window.navPref = navPref;
  window.setNavPref = setNavPref;
  window.navLinks = navLinks;
  window.navButtons = navButtons;
})();
