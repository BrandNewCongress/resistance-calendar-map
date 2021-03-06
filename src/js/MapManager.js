import zeptojs from 'zeptojs'
import { select, selectAll } from 'd3-selection'
import L from 'leaflet'
import * as Cookies from 'js-cookie'
const $ = zeptojs

//Create an event node
function Event(properties) {
  this.properties = properties

  this.blip = null

  this.className = properties.event_type.replace(/[^\w]/gi, '-').toLowerCase()

  this.props = {}
  this.props.title = properties.title
  this.props.url = properties.url
  this.props.start_datetime = properties.start_datetime
  this.props.address = properties.venue
  this.props.intro = properties.intro
  this.props.supergroup = properties.supergroup

  this.props.start_time = new Date(properties.start_datetime)
  this.props.end_time = new Date(properties.end_datetime)
  this.props.offset = properties.timeZoneOffset
  this.props.group = properties.group
  this.props.LatLng = [parseFloat(properties.lat), parseFloat(properties.lng)]
  this.props.event_type = properties.event_type
  this.props.lat = properties.lat
  this.props.lng = properties.lng
  this.props.filters = properties.filters

  this.props.social = {
    facebook: properties.facebook,
    email: properties.email,
    phone: properties.phone,
    twitter: properties.twitter
  }

  this.props.attending = properties.attending
  this.attending = properties.attending

  this.render = function(distance, zipcode) {
    var that = this
    return that.render_event(distance, zipcode)
  }

  this.render_event = function(distance, zipcode) {
    var that = this

    const days = [
      'Sunday',
      'Monday',
      'Tuesday',
      'Wednesday',
      'Thursday',
      'Friday',
      'Saturday'
    ]

    const months = [
      'January',
      'February',
      'March',
      'April',
      'May',
      'June',
      'July',
      'August',
      'September',
      'October',
      'November',
      'December'
    ]

    const startDate = new Date(that.props.start_time)
    const endDate = new Date(that.props.end_time)

    startDate.getLocalHours = function (offset) {
      let base = this.getUTCHours() + offset
      if (base < 0) return 24 + base
      return base
    }

    endDate.getLocalHours = function (offset) {
      let base = this.getUTCHours() + offset
      if (base < 0) return 24 + base
      return base
    }

    const startF = {
      weekDay: days[startDate.getDay()],
      monthDate: `${months[startDate.getMonth()]} ${startDate.getDate()}`,
      time: `${startDate.getLocalHours(that.props.offset) % 12 || 12}${startDate.getMinutes() ? ':' + startDate.getMinutes() : ''} ${startDate.getLocalHours(that.props.offset) >= 12 ? 'PM' : 'AM'}`
    }

    const endF = {
      time: `${endDate.getLocalHours(that.props.offset) % 12 || 12}${endDate.getMinutes() ? ':' + endDate.getMinutes() : ''} ${endDate.getLocalHours(that.props.offset) >= 12 ? 'PM' : 'AM'}`
    }

    const lat = that.props.lat
    const lon = that.props.lng

    const attendingText = typeof that.props.attending != 'undefined' &&
      that.props.attending > 0
      ? '- ' + that.props.attending + ' RSVPs'
      : ''

    const rendered = $('<div class=montserrat/>').addClass(
      'event-item ' + that.className
    ).html(`
        <div class="event-item lato ${that.className}" lat="${lat}" lon="${lon}">
          <h5 class="time-info">
            <div class="dateblock">
              <span class="left" style="text-transform: uppercase">${startF.weekDay}</span>
              <span class="right">${startF.monthDate} ${startF.time} – ${endF.time}</span>
            </div>
          </h5>
          <h3>
            <a target="_blank" href="${that.props.url}" class="event-title">${that.props.title}</a>
          </h3>
          <span class="label-icon"></span>
          <h5 class="event-type">${that.props.event_type} ${attendingText}</h5>
          <p>${that.props.address}</p>
          <p>${that.props.intro || ''}</p>
          <div>
            <a class="rsvp-link" href="${that.props.url}" target="_blank">DETAILS/RSVP</a>
            <span class="time-info-dist" style="float: right; padding-top: 10px">${distance ? distance + 'mi&nbsp;&nbsp;' : ''}</span>
          </div>
        </div>
        `)

    return rendered.html()
  }
}

/****
 *  MapManager proper
 */
function MapManager(eventData, campaignOffices, zipcodes, options) {
  var allFilters = window.eventTypeFilters.map(function(i) {
    return i.id
  })

  var popup = L.popup()
  var options = options
  var zipcodes = zipcodes.reduce(function(zips, item) {
    zips[item.zip] = item
    return zips
  }, {})

  var current_filters = [],
    current_zipcode = '',
    current_distance = '',
    current_sort = ''

  var originalEventList = eventData.map(function(d) {
    return new Event(d)
  })
  var eventsList = originalEventList.slice(0)

  // var officeList = campaignOffices.map(function(d) { return new CampaignOffices(d); });

  // var mapboxTiles = leaflet.tileLayer('http://{s}.tiles.mapbox.com/v4/mapbox.streets/{z}/{x}/{y}.png?access_token=' + leaflet.mapbox.accessToken, { attribution: '<a href="http://www.openstreetmap.org/copyright" target="_blank">&copy; OpenStreetMap contributors</a>'});

  var mapboxTiles = L.tileLayer(
    'https://cartodb-basemaps-{s}.global.ssl.fastly.net/light_all/{z}/{x}/{y}.png',
    {
      maxZoom: 18,
      attribution: '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>, &copy;<a href="https://carto.com/attribution">CARTO</a>'
    }
  )

  var CAMPAIGN_OFFICE_ICON = L.icon({
    iconUrl: '/images/icon/star.png',
    iconSize: [17, 14] // size of the icon
    // shadowSize:   [50, 64], // size of the shadow
    // iconAnchor:   [22, 94], // point of the icon which will correspond to marker's location
    // shadowAnchor: [4, 62],  // the same for the shadow
    // popupAnchor:  [-3, -76] // point from which the popup should open relative to the iconAnchor
  })

  var GOTV_CENTER_ICON = L.icon({
    iconUrl: '/images/icon/gotv-star.png',
    iconSize: [13, 10] // size of the icon
  })
  var defaultCoord = options && options.defaultCoord
    ? options.defaultCoord
    : { center: [37.8, -96.9], zoom: 4 }

  var centralMap = new L.Map(
    'map-container',
    window.customMapCoord ? window.customMapCoord : defaultCoord
  ).addLayer(mapboxTiles)
  if (centralMap) {
  }

  var overlays = L.layerGroup().addTo(centralMap)
  var offices = L.layerGroup().addTo(centralMap)
  var gotvCenter = L.layerGroup().addTo(centralMap)

  var campaignOfficeLayer = L.layerGroup().addTo(centralMap)

  //initialize map
  var filteredEvents = []
  var module = {}

  var _popupEvents = function(event) {
    var target = event.target._latlng

    var filtered = eventsList
      .filter(function(d) {
        return (
          target.lat == d.props.LatLng[0] &&
          target.lng == d.props.LatLng[1] &&
          (!current_filters ||
            current_filters.length == 0 ||
            $(d.properties.filters).not(current_filters).length !=
              d.properties.filters.length)
        )
      })
      .sort(function(a, b) {
        return b.props.attending - a.props.attending
      })

    const superInsides = filtered.map(function(d) {
      return $('<li class=montserrat/>')
        .attr(
          'data-attending',
          (function(prop) {
            var email = Cookies.get('map.bnc.email')
            var events_attended_raw = Cookies.get(
              'map.bnc.eventsJoined.' + email
            )
            var events_attended = events_attended_raw
              ? JSON.parse(events_attended_raw)
              : []
            return $.inArray(prop.id_obfuscated, events_attended) > -1
          })(d.properties)
        )
        .addClass(d.isFull ? 'is-full' : 'not-full')
        .addClass(d.visible ? 'is-visible' : 'not-visible')
        .append(d.render())
    })

    const insides = $("<ul class='popup-list'>")
    superInsides.forEach(el => insides.append(el))

    var div = $('<div />')
      .append(
        filtered.length > 1
          ? "<h3 class='sched-count'>" + filtered.length + ' Results</h3>'
          : ''
      )
      .append($("<div class='popup-list-container'/>").append(insides))

    setTimeout(function() {
      L.popup()
        .setLatLng(event.target._latlng)
        .setContent(div.html())
        .openOn(centralMap)
    }, 10)
  }

  /***
   * Initialization
   */
  var initialize = function() {
    var uniqueLocs = eventsList.reduce(function(arr, item) {
      var className = item.properties.filters.join(' ')
      if (
        arr.indexOf(
          item.properties.lat +
            '||' +
            item.properties.lng +
            '||' +
            className +
            '||' +
            item.props.attending
        ) >= 0
      ) {
        return arr
      } else {
        arr.push(
          item.properties.lat +
            '||' +
            item.properties.lng +
            '||' +
            className +
            '||' +
            item.props.attending
        )
        return arr
      }
    }, [])

    uniqueLocs = uniqueLocs.map(function(d) {
      var split = d.split('||')
      return {
        latLng: [parseFloat(split[0]), parseFloat(split[1])],
        className: split[2],
        attending: split[3]
      }
    })

    uniqueLocs.forEach(function(item) {
      // setTimeout(function() {
      // if (item.className == "campaign-office") {
      //   L.marker(item.latLng, {icon: CAMPAIGN_OFFICE_ICON, className: item.className})
      //     .on('click', function(e) { _popupEvents(e); })
      //     .addTo(offices);
      // } else if (item.className == "gotv-center") {
      //   L.marker(item.latLng, {icon: GOTV_CENTER_ICON, className: item.className})
      //     .on('click', function(e) { _popupEvents(e); })
      //     .addTo(gotvCenter);
      // }else
      // if (item.className.match(/bernie\-event/ig)) {
      //   L.circleMarker(item.latLng, { radius: 12, className: item.className, color: 'white', fillColor: '#F55B5B', opacity: 0.8, fillOpacity: 0.7, weight: 2 })
      //     .on('click', function(e) { _popupEvents(e); })
      //     .addTo(overlays);
      // }

      if (item.attending > 2000 && item.className == 'event') {
        L.marker(item.latLng, {
          icon: new L.Icon({
            iconUrl: '/images/pin.png',
            iconRetinaUrl: '/images/pin-2x.png',
            iconSize: [25, 41],
            className: item.className
          })
        })
          .on('click', function(e) {
            _popupEvents(e)
          })
          .addTo(overlays)
      } else if (item.className == 'event') {
        L.circleMarker(item.latLng, {
          radius: 5,
          className: item.className,
          color: 'white',
          fillColor: '#7932AC',
          opacity: 0.8,
          fillOpacity: 0.7,
          weight: 2
        })
          .on('click', function(e) {
            _popupEvents(e)
          })
          .addTo(overlays)
      } else if (item.className == 'group-meeting') {
        L.circleMarker(item.latLng, {
          radius: 5,
          className: item.className,
          color: 'white',
          fillColor: 'black',
          opacity: 0.8,
          fillOpacity: 0.7,
          weight: 2
        })
          .on('click', function(e) {
            _popupEvents(e)
          })
          .addTo(overlays)
      } else if (item.className == 'group') {
        L.circleMarker(item.latLng, {
          radius: 4,
          className: item.className,
          color: 'white',
          fillColor: 'lightgray',
          opacity: 0.6,
          fillOpacity: 0.9,
          weight: 2
        })
          .on('click', function(e) {
            _popupEvents(e)
          })
          .addTo(overlays)
      } else {
        L.circleMarker(item.latLng, {
          radius: 5,
          className: item.className,
          color: 'white',
          fillColor: '#a00003',
          opacity: 0.8,
          fillOpacity: 0.7,
          weight: 2
        })
          .on('click', function(e) {
            _popupEvents(e)
          })
          .addTo(overlays)
      }
      // }, 10);
    })

    // $(".leaflet-overlay-pane").find(".bernie-event").parent().prependTo('.leaflet-zoom-animated');
  } // End of initialize

  var toMile = function(meter) {
    return meter * 0.00062137
  }

  var filterEventsByCoords = function(center, distance, filterTypes) {
    var zipLatLng = L.latLng(center)

    var filtered = eventsList.filter(function(d) {
      var dist = toMile(zipLatLng.distanceTo(d.props.LatLng))

      if (dist < distance) {
        d.distance = Math.round(dist * 10) / 10

        //If no filter was a match on the current filter
        if (options && options.defaultCoord && !filterTypes) {
          return true
        }

        if (
          $(d.props.filters).not(filterTypes).length == d.props.filters.length
        ) {
          return false
        }

        return true
      }
      return false
    })

    return filtered
  }

  var filterEvents = function(zipcode, distance, filterTypes) {
    return filterEventsByCoords(
      [parseFloat(zipcode.lat), parseFloat(zipcode.lon)],
      distance,
      filterTypes
    )
  }

  var sortEvents = function(filteredEvents, sortType) {
    switch (sortType) {
      case 'distance':
        ga('send', 'event', 'Sort', 'type', 'distance')
        filteredEvents = filteredEvents.sort(function(a, b) {
          return a.distance - b.distance
        })
        break
      case 'attendance':
        ga('send', 'event', 'Sort', 'type', 'attendance')
        filteredEvents = filteredEvents.sort(function(a, b) {
          return b.props.attending - a.props.attending
        })
        break
      default:
        ga('send', 'event', 'Sort', 'type', 'time')
        filteredEvents = filteredEvents.sort(function(a, b) {
          return a.props.start_time - b.props.start_time
        })
        break
    }

    // filteredEvents = filteredEvents.sort(function(a, b) {
    //   var aFull = a.isFull();
    //   var bFull = b.isFull();

    //   if (aFull && bFull) { return 0; }
    //   else if (aFull && !bFull) { return 1; }
    //   else if (!aFull && bFull) { return -1; }
    // });
    //sort by fullness;
    //..
    return filteredEvents
  }

  setTimeout(function() {
    initialize()
  }, 10)

  module._eventsList = eventsList
  module._zipcodes = zipcodes
  module._options = options

  /*
  * Refresh map with new events map
  */
  var _refreshMap = function() {
    overlays.clearLayers()
    initialize()
  }

  module.filterByType = function(type) {
    if ($(filters).not(type).length != 0 || $(type).not(filters).length != 0) {
      current_filters = type

      //Filter only items in the list
      // eventsList = originalEventList.filter(function(eventItem) {
      //   var unmatch = $(eventItem.properties.filters).not(filters);
      //   return unmatch.length != eventItem.properties.filters.length;
      // });

      // var target = type.map(function(i) { return "." + i }).join(",");
      // $(".leaflet-overlay-pane").find("path:not("+type.map(function(i) { return "." + i }).join(",") + ")")

      var toHide = $(allFilters).not(type)

      if (toHide && toHide.length > 0) {
        toHide = toHide.splice(0, toHide.length)
        $('.leaflet-overlay-pane').find('.' + toHide.join(',.')).hide()
        $('.leaflet-marker-pane').find('.' + toHide.join(',.')).hide()
      }

      if (type && type.length > 0) {
        $('.leaflet-overlay-pane').find('.' + type.join(',.')).show()
        $('.leaflet-marker-pane').find('.' + type.join(',.')).show()
        // _refreshMap();
      }

      //Specifically for campaign office
      if (!type) {
        centralMap.removeLayer(offices)
      } else if (type && type.indexOf('campaign-office') < 0) {
        centralMap.removeLayer(offices)
      } else {
        centralMap.addLayer(offices)
      }

      //For gotv-centers
      if (!type) {
        centralMap.removeLayer(gotvCenter)
      } else if (type && type.indexOf('gotv-center') < 0) {
        centralMap.removeLayer(gotvCenter)
      } else {
        centralMap.addLayer(gotvCenter)
      }
    }
    return
  }

  module.filterByCoords = function(coords, distance, sort, filterTypes) {
    //Remove list
    select('#event-list').selectAll('li').remove()

    var filtered = filterEventsByCoords(coords, parseInt(distance), filterTypes)
    //Sort event
    filtered = sortEvents(filtered, sort, filterTypes)

    //Check cookies
    var email = Cookies.get('map.bernie.email')
    var events_attended_raw = Cookies.get('map.bernie.eventsJoined.' + email)
    var events_attended = events_attended_raw
      ? JSON.parse(events_attended_raw)
      : []

    //Render event
    var eventList = select('#event-list')
      .selectAll('li')
      .data(filtered, function(d) {
        return d.props.url
      })

    eventList
      .enter()
      .append('li')
      .attr('data-attending', function(d, id) {
        return $.inArray(d.properties.id_obfuscated, events_attended) > -1
      })
      .attr('class', function(d) {
        return (
          (d.isFull ? 'is-full' : 'not-full') +
          ' ' +
          (this.visible ? 'is-visible' : 'not-visible')
        )
      })
      .classed('lato', true)
      .html(function(d) {
        return d.render(d.distance)
      })

    eventList.exit().remove()

    //add a highlighted marker
    function addhighlightedMarker(lat, lon) {
      var highlightedMarker = new L.circleMarker([lat, lon], {
        radius: 5,
        color: '#ea504e',
        fillColor: '#1462A2',
        opacity: 0.8,
        fillOpacity: 0.7,
        weight: 2
      }).addTo(centralMap)
      // event listener to remove highlighted markers
      $('.not-full').mouseout(function() {
        centralMap.removeLayer(highlightedMarker)
      })
    }

    // event listener to get the mouseover
    $('.not-full').mouseover(function() {
      $(this).toggleClass('highlight')
      var cMarkerLat = $(this).children('div').attr('lat')
      var cMarkerLon = $(this).children('div').attr('lon')
      // function call to add highlighted marker
      addhighlightedMarker(cMarkerLat, cMarkerLon)
    })

    //Push all full items to end of list
    $('div#event-list-container ul#event-list li.is-full').appendTo(
      'div#event-list-container ul#event-list'
    )

    //Move campaign offices to

    var officeCount = $(
      'div#event-list-container ul#event-list li .campaign-office'
    ).length
    $('#hide-show-office').attr('data-count', officeCount)
    $('#campaign-off-count').text(officeCount)
    $('section#campaign-offices ul#campaign-office-list *').remove()
    $('div#event-list-container ul#event-list li .campaign-office')
      .parent()
      .appendTo('section#campaign-offices ul#campaign-office-list')
  }

  /***
   * FILTER()  -- When the user submits query, we will look at this.
   */
  module.filter = function(zipcode, distance, sort, filterTypes) {
    //Check type filter

    if (!zipcode || zipcode == '') {
      return
    }

    //Start if other filters changed
    var targetZipcode = zipcodes[zipcode]

    //Remove list
    select('#event-list').selectAll('li').remove()

    if (targetZipcode == undefined || !targetZipcode) {
      $('#event-list').append(
        "<li class='error lato'>Zipcode does not exist. <a href=\"https://go.berniesanders.com/page/event/search_results?orderby=zip_radius&zip_radius%5b0%5d=" +
          zipcode +
          '&zip_radius%5b1%5d=100&country=US&radius_unit=mi">Try our events page</a></li>'
      )
      return
    }

    //Calibrate map
    var zoom = 4
    switch (parseInt(distance)) {
      case 5:
        zoom = 12
        break
      case 10:
        zoom = 11
        break
      case 20:
        zoom = 10
        break
      case 50:
        zoom = 9
        break
      case 100:
        zoom = 8
        break
      case 250:
        zoom = 7
        break
      case 500:
        zoom = 5
        break
      case 750:
        zoom = 5
        break
      case 1000:
        zoom = 4
        break
      case 2000:
        zoom = 4
        break
      case 3000:
        zoom = 3
        break
    }
    if (!(targetZipcode.lat && targetZipcode.lat != '')) {
      return
    }

    if (current_zipcode != zipcode || current_distance != distance) {
      current_zipcode = zipcode
      current_distance = distance
      centralMap.setView(
        [parseFloat(targetZipcode.lat), parseFloat(targetZipcode.lon)],
        zoom
      )
    }

    ga('send', 'event', 'Range', 'distance', parseInt(distance))

    var filtered = filterEvents(targetZipcode, parseInt(distance), filterTypes)

    //Sort event
    filtered = sortEvents(filtered, sort, filterTypes)

    //Check cookies
    var email = Cookies.get('map.bernie.email')
    var events_attended_raw = Cookies.get('map.bernie.eventsJoined.' + email)
    var events_attended = events_attended_raw
      ? JSON.parse(events_attended_raw)
      : []

    //Render event
    var eventList = select('#event-list')
      .selectAll('li')
      .data(filtered, function(d) {
        return d.props.url
      })

    eventList
      .enter()
      .append('li')
      .attr('data-attending', function(d, id) {
        return (
          $.inArray(
            d.props.address + ' ' + d.props.start_datetime,
            events_attended
          ) > -1
        )
      })
      .attr('class', function(d) {
        return (
          (d.isFull ? 'is-full' : 'not-full') +
          ' ' +
          (this.visible ? 'is-visible' : 'not-visible')
        )
      })
      .classed('lato', true)
      .html(function(d) {
        return d.render(d.distance)
      })

    eventList.exit().remove()

    //add a highlighted marker
    function addhighlightedMarker(lat, lon) {
      var highlightedMarker = new L.circleMarker([lat, lon], {
        radius: 5,
        color: '#ea504e',
        fillColor: '#1462A2',
        opacity: 0.8,
        fillOpacity: 0.7,
        weight: 2
      }).addTo(centralMap)
      // event listener to remove highlighted markers
      $('.not-full').mouseout(function() {
        centralMap.removeLayer(highlightedMarker)
      })
    }

    // event listener to get the mouseover
    $('.not-full').mouseover(function() {
      $(this).toggleClass('highlight')
      var cMarkerLat = $(this).children('div').attr('lat')
      var cMarkerLon = $(this).children('div').attr('lon')
      // function call to add highlighted marker
      addhighlightedMarker(cMarkerLat, cMarkerLon)
    })

    //Push all full items to end of list
    $('div#event-list-container ul#event-list li.is-full').appendTo(
      'div#event-list-container ul#event-list'
    )

    //Move campaign offices to

    var officeCount = $(
      'div#event-list-container ul#event-list li .campaign-office'
    ).length
    $('#hide-show-office').attr('data-count', officeCount)
    $('#campaign-off-count').text(officeCount)
    $('section#campaign-offices ul#campaign-office-list *').remove()
    $('div#event-list-container ul#event-list li .campaign-office')
      .parent()
      .appendTo('section#campaign-offices ul#campaign-office-list')
  }

  module.toMapView = function() {
    $('body').removeClass('list-view').addClass('map-view')
    centralMap.invalidateSize()
    centralMap._onResize()
  }
  module.toListView = function() {
    $('body').removeClass('map-view').addClass('list-view')
  }

  module.getMap = function() {
    return centralMap
  }

  return module
}

$(document).on('click', function(event, params) {
  $('.event-rsvp-activity').hide()
})

$(document).on('click', '.rsvp-link, .event-rsvp-activity', function(
  event,
  params
) {
  event.stopPropagation()
})

//Show email
$(document).on('show-event-form', function(events, target) {
  var form = $(target).closest('.event-item').find('.event-rsvp-activity')
  if (Cookies.get('map.bernie.email')) {
    form.find('input[name=email]').val(Cookies.get('map.bernie.email'))
  }

  if (Cookies.get('map.bernie.phone')) {
    form.find('input[name=phone]').val(Cookies.get('map.bernie.phone'))
  }

  // var params =  $.deparam(window.location.hash.substring(1) || "");
  // form.find("input[name=zipcode]").val(params.zipcode ? params.zipcode : Cookies.get('map.bernie.zipcode'));

  form.fadeIn(100)
})

$(document).on('submit', 'form.event-form', function() {
  var query = $.deparam($(this).serialize())
  var params = $.deparam(window.location.hash.substring(1) || '')
  query['zipcode'] = params['zipcode'] || query['zipcode']

  var $error = $(this).find('.event-error')
  var $container = $(this).closest('.event-rsvp-activity')

  if (
    query['has_shift'] == 'true' &&
    (!query['shift_id'] || query['shift_id'].length == 0)
  ) {
    $error.text('You must pick a shift').show()
    return false
  }

  var shifts = null
  var guests = 0
  if (query['shift_id']) {
    shifts = query['shift_id'].join()
  }

  if (!query['phone'] || query['phone'] == '') {
    $error.text('Phone number is required').show()
    return false
  }

  if (!query['email'] || query['email'] == '') {
    $error.text('Email is required').show()
    return false
  }

  if (
    !query['email']
      .toUpperCase()
      .match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/)
  ) {
    $error.text('Please input valid email').show()
    return false
  }

  // if (!query['name'] || query['name'] == "") {
  //   $error.text("Please include your name").show();
  //   return false;
  // }

  $(this).find('.event-error').hide()
  var $this = $(this)
  $.ajax({
    type: 'POST',
    url: 'https://organize.berniesanders.com/events/add-rsvp',
    // url: 'https://bernie-ground-control-staging.herokuapp.com/events/add-rsvp',
    crossDomain: true,
    dataType: 'json',
    data: {
      // name: query['name'],
      phone: query['phone'],
      email: query['email'],
      zip: query['zipcode'],
      shift_ids: shifts,
      event_id_obfuscated: query['id_obfuscated']
    },
    success: function(data) {
      Cookies.set('map.bernie.zipcode', query['zipcode'], { expires: 7 })
      Cookies.set('map.bernie.email', query['email'], { expires: 7 })
      Cookies.set('map.bernie.name', query['name'], { expires: 7 })

      if (query['phone'] != '') {
        Cookies.set('map.bernie.phone', query['phone'], { expires: 7 })
      }

      //Storing the events joined
      var events_joined = JSON.parse(
        Cookies.get('map.bnc.eventsJoined.' + query['email']) || '[]'
      ) || []

      events_joined.push(query['id_obfuscated'])
      Cookies.set('map.bnc.eventsJoined.' + query['email'], events_joined, {
        expires: 7
      })

      $this.closest('li').attr('data-attending', true)

      $this.html(
        "<h4 style='border-bottom: none'>RSVP Successful! Thank you for joining to this event!</h4>"
      )
      $container.delay(1000).fadeOut('fast')
    }
  })

  return false
})

export default MapManager
