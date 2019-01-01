const request = require('request');
const fs = require('fs');
const bota = require('btoa');
const process = require('process');
const Promise = require('bluebird');

const credentials = JSON.parse(fs.readFileSync(__dirname + '/credentials.json'));
const redirect_uri = 'http://localhost:8888/callback';


// See if authorization.json exists. If so, use those credentials
// to query the api
if (fs.existsSync(__dirname + '/authorization.json')) {
    var authorization = JSON.parse(
        fs.readFileSync(__dirname + '/authorization.json')
    );
    
    SaveRecentTracks(authorization);

} else {

    // We don't have authorization yet. Get it using the
    // authorization code.
    AuthorizeWithCode(
        credentials.client_id,
        credentials.client_secret,
        credentials.authorization_code,
        redirect_uri
    ).then(function(tokens) {

        fs.writeFileSync(
            __dirname + '/authorization.json',
            JSON.stringify(tokens, null, 2)
        );

        SaveRecentTracks(tokens);
    })
    .catch(function(error) {
        console.error(error);
        process.exit(0);
    });
}


// { client_id :: String, client_secret :: String, refresh_token :: String } -> IO
function SaveRecentTracks(authorization) {

    AuthorizeWithRefreshToken(
        credentials.client_id,
        credentials.client_secret,
        authorization.refresh_token
    ).then(function(newAuthorization) {

        var latestTimestamp;
        var directory = __dirname + '/data/';

        readFirstTrackFrom(directory + "latest.json")
            .then(function(track) {
                latestTimestamp = track.played_at;
            }, function() { /* noop */ })
            .catch(console.error)
            .finally(function() {

                GetRecentTracks(newAuthorization.access_token, latestTimestamp)
                    .then(function(tracks) {
        
                        
                        if (tracks.items.length === 0) {
                            // Noop. There are no new songs
                            console.log('No new songs have played since ' + new Date(latestTimestamp).toLocaleString());
                            process.exit(0);
                        } else {
                            saveNew();
                            console.log('Saving songs to data folder.');
                            process.exit(0);
                        }                           
                        
                        function saveNew() {

                            var filename = Date.now() + '-recently-played.json';
                            
                            fs.writeFileSync(
                                directory + filename,
                                JSON.stringify(tracks, null, 2)
                            );
            
                            fs.writeFileSync(
                                directory + "latest.json",
                                JSON.stringify(tracks, null, 2)
                            );
                        }
                       
                    })
            })
            
    })
    .catch(function(error) {
        console.error(error);
        process.exit(1);
    });
}


// FilePathString -> Promise Error SpotifyTrack
function readFirstTrackFrom(file) {
    return new Promise(function(resolve, reject) {
        var text = fs.readFileSync(file, 'utf8');
        var content = JSON.parse(text);

        if (content.items.length > 0) {
            resolve(content.items[0]);
        } else {
            reject();
        }
        
    })
}


//    ClientIDString
// -> ClientSecretString
// -> RefreshTokenString
// -> Promise Error { access_token :: AccessTokenString, token_type :: String, expires_in :: Int, scope :: String }
function AuthorizeWithRefreshToken(client_id, client_secret, refresh_token) {

    var botaAuth = bota(client_id + ":" + client_secret);
    
    return new Promise(function(resolve, reject) {
        request({
            url : "https://accounts.spotify.com/api/token",
            method: 'POST',
            form : {
                grant_type : 'refresh_token',
                refresh_token : refresh_token
            },
            headers : {
                'Authorization' : "Basic " + botaAuth
            }
        }, function(e, response){
            if (e) {
                reject(e);
                return;
            }
            resolve(JSON.parse(response.body)); 

        })
    });
}


//    ClientIDString
// -> ClientSecretString
// -> AuthorizationCodeString
// -> RedirectURIString
// -> Promise Error { refresh_token :: RefreshTokenString, token_type :: String, expires_in :: Int, scope :: String }
function AuthorizeWithCode(client_id, client_secret, authorization_code, redirect_uri) {

    var botaAuth = bota(client_id + ":" + client_secret);
    
    return new Promise(function(resolve, reject) {
        request({
            url : "https://accounts.spotify.com/api/token",
            method: 'POST',
            form : {
                grant_type : 'authorization_code',
                code : authorization_code,
                redirect_uri : redirect_uri
            },
            headers : {
                'Authorization' : "Basic " + botaAuth
            }
        }, function(e, response){
            if (e) {
                reject(e);
                return;
            }
            const body = JSON.parse(response.body);
            if (body.access_token) {
                resolve(body);
            } else {
                const err = new Error('Response does not have access_token');
                err.body = body;
                reject(err);
            }
        });

    })
}


// AccessTokenString -> ISO8601(UTC)String -> Promise Error { items : Array TrackInfo }
// Get all tracks after a specific date and time
function GetRecentTracks(access_token, afterTimestamp) {
    return new Promise(function(resolve, reject) {

        console.log("Getting tracks after " + new Date(afterTimestamp).toLocaleString());

        if (afterTimestamp) {
            var q = {
                after : (new Date(afterTimestamp)).getTime(),
                limit : 50
            }
        } else {
            var q = {
                limit : 50
            };
        }

        request({
            url : "https://api.spotify.com/v1/me/player/recently-played",
            method : 'GET',
            qs : q,
            headers : {
                'Authorization' : 'Bearer ' + access_token
            }
        }, function(e, response) {
            if (e) {
                reject(e);
                return;
            }
            resolve(JSON.parse(response.body));
           
        });

    });

}