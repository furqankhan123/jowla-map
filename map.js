var map,infoWindow;
var locations = [];
var frisco = {lat: 33.0597, lng: -96.7512};

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
				var pos = {
				  lat: position.coords.latitude,
				  lng: position.coords.longitude
				};
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
		var results = new RegExp('[\?&]' + name + '=([^&#]*)').exec(window.location.href);
		if (results==null){
		   return null;
		}
		else{
		   return results[1] || 0;
		}
	}

  $.getJSON("https://sheets.googleapis.com/v4/spreadsheets/1U7JJDnTvClhdpHCje29uLwTNCiBhdPfUPxzChbxoXNQ/values/DFWDB!A2:V?key=AIzaSyBWKjSZa8wcaEEqUrjk-opBhmEVxd6GbPQ", function(data) {
    	$(data.values).each(function() {
    		var location = {};
				location.db = this[0];
				location.id = this[2];
				location.name = this[3];
				location.address = this[4];
				location.add=encodeURIComponent(this[4]);
				location.latitude = parseFloat(this[5]);
      	        location.longtitude = parseFloat(this[6]);
                location.city = this[7];
				location.zip=this[8];
				location.unit=this[11];
				location.marker=this[12];
				location.sts = this[13];
				location.visitcode=this[14];
				location.comments=this[15];
				location.visitdate=this[16];
				location.rowid=this[21];
	  		    locations.push(location);
    	});
		console.log('locations size    '+locations.length);
		
		var city=decodeURIComponent($.urlParam('City'));
		var stts=decodeURIComponent($.urlParam('S'));
	        var searchname=decodeURIComponent($.urlParam('F'));

		var sql= 'SELECT name,visitdate,marker,comments,latitude,longtitude, address,db,id, city ,sts,rowid FROM ? where marker <> "placemark_circle_highlight"  ';
		var whereClause="";
		if (searchname != "Search" && searchname != "null"){
			whereClause += " AND  name like \"%"+searchname+"%\" ";
		}
		if (city!="null"){			
			var temp=city.replace("=="," AND city = ");			
			var addlClause=temp.replace("!="," AND city <> ");	
			whereClause += addlClause;
		}
		if (stts!="null"){
			if (stts =="S") whereClause +=" AND  sts like \"%Student%\" ";
			if (stts =="K") whereClause +=" AND  sts like \"%Khususi%\"  ";
			if (stts =="F") whereClause +=" AND  sts  like \"%Follow%\"  ";
			if (stts =="W") whereClause +=" AND  sts  like \"%Week%\"  ";
		}		
		sql = sql + whereClause;
		var res = alasql(sql, [locations] );
		console.log(" result length is "+res.length);

      var mapOptions = {
	    zoom: 16,
		center: frisco
      };
      var map = new google.maps.Map(document.getElementById('map'), mapOptions);
	  infoWindow = new google.maps.InfoWindow;
	    setLocations(map, res);
        var centerControlDiv = document.createElement('div');
        var centerControl = new CenterControl(centerControlDiv, map);

        centerControlDiv.index = 1;
        map.controls[google.maps.ControlPosition.BOTTOM_CENTER].push(centerControlDiv);

        if (typeof addOptimizeControl === 'function') {
          addOptimizeControl(map);
        }
  });
}

function setLocations(map, locations) {
  var bounds = new google.maps.LatLngBounds();
  var infowindow = new google.maps.InfoWindow({
    content: "Content String",
    maxWidth: 350,
    maxHeight: 400
  });
  var count = 0;
  for (var i = 0; i < locations.length; i++) {
    if (!locations[i].latitude || !locations[i].longtitude) continue;
    var new_marker = createMarker(map, locations[i], infowindow);
    bounds.extend(new_marker.position);
    count++;
  }
  google.maps.event.trigger(map, "resize");
  // Fit to the filtered set so a city view shows all its markers
  if (count > 1 && count < 2000) {
    map.fitBounds(bounds);
  }
}

function createMarker(map, location, infowindow) {
  var position = {
    lat: parseFloat(location.latitude),
    lng: parseFloat(location.longtitude)
  };
  var markerurl="https://maps.google.com/mapfiles/kml/paddle/"+location.marker+".png";
  var marker = new google.maps.Marker({	  
    position: position,
    map: map,
    title: location.name,  
    icon :{
		url: markerurl,
		scaledSize: new google.maps.Size(40, 40)
	},
  });
  google.maps.event.addListener(marker, 'click', function() {
    infowindow.setContent('<div>'+
    '' + 
	((location.name === undefined) ? "" : ('<p><strong> Name: ' + location.name + ' </strong></p>')) +
    ((location.address === undefined) ? location.address : ('<a href=https://www.google.com/maps/dir/?api=1&destination="' + encodeURIComponent(location.address) +'">' + location.address + '</a>')) + '</strong></p>' +
	((location.comments === undefined) ? "" : ('<p><strong>Comments: </strong>' + location.comments + '</p>')) +
	((location.visitdate === undefined) ? "" : ('<p><strong>Last Visit Date: </strong>' + location.visitdate + '</p>')) +
    ('<a href=https://dailyfikr.github.io/VisitDetails.html?DB='+location.db+'&ID='+location.rowid+'&Name='+encodeURI(location.name)+'&Sts='+encodeURI(location.sts)+' target ="_blank"> Visit Details </a>')+
	'</div>');
    infowindow.open(map, marker);
  });
  return marker;
}
