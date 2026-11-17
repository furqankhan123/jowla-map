var map, infoWindow;
var locations = [];
var visibleLocations = [];
var markers = [];
var frisco = {lat: 33.0597, lng: -96.7512};

function isDoNotVisit(loc) {
  var vc = (loc.visitcode || '').toString().toLowerCase();
  return vc.indexOf('do not visit') !== -1;
}

function CenterControl(controlDiv, map) {
  var controlUI = document.createElement('div');
  controlUI.style.backgroundColor = '#fff';
  controlUI.style.border = '2px solid #fff';
  controlUI.style.borderRadius = '3px';
  controlUI.style.boxShadow = '0 2px 6px rgba(0,0,0,.3)';
  controlUI.style.cursor = 'pointer';
  controlUI.style.marginBottom = '22px';
  controlUI.style.textAlign = 'center';
  controlUI.title = 'Click to recenter the map';
  controlDiv.appendChild(controlUI);

  var controlText = document.createElement('div');
  controlText.style.color = 'rgb(25,25,25)';
  controlText.style.fontFamily = 'Roboto,Arial,sans-serif';
  controlText.style.fontSize = '16px';
  controlText.style.lineHeight = '38px';
  controlText.style.paddingLeft = '5px';
  controlText.style.paddingRight = '5px';
  controlText.innerHTML = 'Nearby';
  controlUI.appendChild(controlText);

  controlUI.addEventListener('click', function() {
    infoWindow = new google.maps.InfoWindow;
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(function(position) {
        var pos = { lat: position.coords.latitude, lng: position.coords.longitude };
        map.setCenter(pos);
        map.setZoom(17);
      }, function() {
        handleLocationError(true, infoWindow, map.getCenter());
      });
    }
  });
}
function handleLocationError(browserHasGeolocation, infoWindow, pos) {
  map.setCenter(pos);
  map.setZoom(16);
}

function initialiseMap() {
  $.urlParam = function(name){
    var results = new RegExp('[\\?&]' + name + '=([^&#]*)').exec(window.location.href);
    if (results == null) return null;
    return results[1] || 0;
  };

  $.getJSON("https://sheets.googleapis.com/v4/spreadsheets/1U7JJDnTvClhdpHCje29uLwTNCiBhdPfUPxzChbxoXNQ/values/DFWDB!A2:V?key=AIzaSyBWKjSZa8wcaEEqUrjk-opBhmEVxd6GbPQ", function(data) {
    $(data.values).each(function() {
      var location = {};
      location.db = this[0];
      location.id = this[2];
      location.name = this[3];
      location.address = this[4];
      location.add = encodeURIComponent(this[4]);
      location.latitude = parseFloat(this[5]);
      location.longtitude = parseFloat(this[6]);
      location.city = this[7];
      location.zip = this[8];
      location.unit = this[11];
      location.marker = this[12];
      location.sts = this[13];
      location.visitcode = this[14];
      location.comments = this[15];
      location.visitdate = this[16];
      location.rowid = this[21];
      if (isDoNotVisit(location)) return;
      locations.push(location);
    });
    console.log('locations size (after DNV filter) ' + locations.length);

    var mapOptions = { zoom: 16, center: frisco };
    map = new google.maps.Map(document.getElementById('map'), mapOptions);
    infoWindow = new google.maps.InfoWindow;

    applyUrlFilters();

    var centerControlDiv = document.createElement('div');
    var centerControl = new CenterControl(centerControlDiv, map);
    centerControlDiv.index = 1;
    map.controls[google.maps.ControlPosition.BOTTOM_CENTER].push(centerControlDiv);

    if (typeof addOptimizeControl === 'function') {
      addOptimizeControl(map);
    }
  });
}

function parseCityParam(raw) {
  if (!raw || raw === 'null') return null;
  try {
    var decoded = decodeURIComponent(raw);
    // Handles City===%27Princeton%27 or City=='Princeton' or City=Princeton
    decoded = decoded.replace(/^=+/, '').replace(/^'+|'+$/g, '').trim();
    return decoded || null;
  } catch (e) {
    return raw;
  }
}

function applyUrlFilters() {
  var cityParam = $.urlParam('City');
  var stts = $.urlParam('S');
  var searchname = $.urlParam('F');
  var visited = $.urlParam('P');

  var city = parseCityParam(cityParam);
  if (searchname) {
    try { searchname = decodeURIComponent(searchname); } catch(e) {}
  }

  console.log('Parsed city:', city, 'status:', stts, 'name:', searchname, 'visited:', visited);

  var now = new Date();
  visibleLocations = locations.filter(function(loc) {
    if (city && loc.city !== city) return false;
    if (stts && stts !== 'null') {
      var s = (loc.sts || '').toLowerCase();
      if (stts === 'S' && s.indexOf('student') === -1) return false;
      if (stts === 'K' && s.indexOf('khususi') === -1) return false;
      if (stts === 'F' && s.indexOf('follow') === -1) return false;
      if (stts === 'W' && s.indexOf('week') === -1) return false;
    }
    if (searchname && searchname !== 'Search' && searchname !== 'null') {
      if (!(loc.name || '').toLowerCase().includes(searchname.toLowerCase())) return false;
    }
    if (visited && visited !== 'All' && visited !== 'null') {
      if (!loc.visitdate) {
        if (visited !== '0') return false;
      } else {
        var visit = new Date(loc.visitdate);
        if (!isNaN(visit.getTime())) {
          var days = (now - visit) / (1000 * 60 * 60 * 24);
          if (visited === '0') return false;
          if (visited === '1' && days < 30) return false;
          if (visited === '3' && days < 90) return false;
          if (visited === '6' && days < 180) return false;
        }
      }
    }
    return true;
  });

  console.log('visible after filter:', visibleLocations.length);
  window.visibleLocations = visibleLocations;
  clearMarkers();
  setLocations(map, visibleLocations);
}

function clearMarkers() {
  markers.forEach(function(m) { m.setMap(null); });
  markers = [];
}

function setLocations(map, locs) {
  var bounds = new google.maps.LatLngBounds();
  var infowindow = new google.maps.InfoWindow({ content: "Content String", maxWidth: 350, maxHeight: 400 });
  var count = 0;
  for (var i = 0; i < locs.length; i++) {
    if (!locs[i].latitude || !locs[i].longtitude) continue;
    var new_marker = createMarker(map, locs[i], infowindow);
    markers.push(new_marker);
    bounds.extend(new_marker.position);
    count++;
  }
  google.maps.event.trigger(map, "resize");
  if (count > 1 && count < 2000) {
    map.fitBounds(bounds);
  }
}

function createMarker(map, location, infowindow) {
  var position = { lat: parseFloat(location.latitude), lng: parseFloat(location.longtitude) };
  var markerurl = "https://maps.google.com/mapfiles/kml/paddle/" + location.marker + ".png";
  var marker = new google.maps.Marker({
    position: position,
    map: map,
    title: location.name,
    icon: { url: markerurl, scaledSize: new google.maps.Size(40, 40) }
  });
  google.maps.event.addListener(marker, 'click', function() {
    window.__pendingStart = location;
    infowindow.setContent('<div>' +
      ((location.name === undefined) ? "" : ('<p><strong> Name: ' + location.name + ' </strong></p>')) +
      ((location.address === undefined) ? location.address : ('<a href=https://www.google.com/maps/dir/?api=1&destination="' + encodeURIComponent(location.address) + '">' + location.address + '</a>')) + '</strong></p>' +
      ((location.comments === undefined) ? "" : ('<p><strong>Comments: </strong>' + location.comments + '</p>')) +
      ((location.visitdate === undefined) ? "" : ('<p><strong>Last Visit Date: </strong>' + location.visitdate + '</p>')) +
      ('<a href=https://dailyfikr.github.io/VisitDetails.html?DB=' + location.db + '&ID=' + location.rowid + '&Name=' + encodeURI(location.name) + '&Sts=' + encodeURI(location.sts) + ' target ="_blank"> Visit Details </a>') +
      '<p><a href="#" onclick="if(window.setRouteStart){setRouteStart(window.__pendingStart);}return false;">Set as start</a></p>' +
      '</div>');
    infowindow.open(map, marker);
  });
  return marker;
}
