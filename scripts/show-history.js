// Requires node >= v10.15
var fs = require('fs').promises;
var _ = require('lodash');
var Promise = require("bluebird");


// Object -> Optional Array Keys -> Object
// Flatten a deeply nested object into a single depth object
function flattenObj(e,t){var r={};t=
t||[];for(var a in e)if(e.hasOwnProperty(a))if(_.isObject(e[a])&&!_.isArray(e[a])){var i=t.concat();i.push(a),_.extend(r,flattenObj(e[a],i))}else{var u={};t.length>0?u[t.join(".")+"."+a]=e[a]:u[a]=e[a],_.extend(r,u)}return r}


// Array FileString -> Array FileString
function onlyJson(files) {
   return Promise.resolve(files.filter(x => x.endsWith('.json')));
}

// PrePrunedSpotifyTrack -> PrunedSpotifyTrack
// Add/Remove data to the track
function pruneTrack(track) {
    delete track['track.available_markets'];
    delete track['track.context'];
    delete track['track.disc_number'];
    return track;
}

// SpotifyTrack -> PrePrunedSpotifyTrack
// Add/Remove data from the track
function prePruneTrack(track) {
    delete track.track.album;
    return track;
}

// Array FileNameString -> Array PrunedSpotifyTrack
function processFiles(files) {

    // Map SongPlayDate Song
    const songs = {};
    const songList = [];

    var promises = files.map(function(file) {

        return fs.readFile(file, 'utf-8')
            .then(JSON.parse)
            .then(function(content) {
                content.items.forEach(function(track) {
                    if (songs[track.played_at]) {
                        return;
                    } else {
                        var localTime = new Date(track.played_at);
                        track.track.played_at_local = localTime.toLocaleString();

                        var flatTrack = flattenObj(prePruneTrack(track));
                        var prunedTrack = pruneTrack(flatTrack);

                        songs[track.played_at] = prunedTrack;
                        
                        songList.push(prunedTrack);
                    }
                });

                return content;

            })

    });

    return Promise.all(promises).then(function(x) {
        const byPlayedAt = (x, y) => new Date(x.played_at) > new Date(y.played_at);
        return songList.sort(byPlayedAt);
    });
    
}


fs.readdir(__dirname + '/../data/')
    .then(onlyJson)
    .then(x => Promise.resolve(x.map(y => 'data/' + y)))
    .then(processFiles)
    .then(tracks => tracks.map(t => t['track.played_at_local'] + " - " + t['track.artists'][0].name + " - " + t['track.name'] ))
    .then(console.log)
    .catch(console.error)