# Get Listening History With The Spotify API

A nodejs script to periodically download your [recently played spotify tracks]((https://developer.spotify.com/documentation/web-api/reference/player/get-recently-played/)).

# Quick Start

Download [dgendill/spotify-play-history](https://github.com/dgendill/spotify-play-history) and run `npm install` in the project root. Create a new app in the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard/applications). Enter the Client ID in the `server/index.html` file. Run `npm run server`, which will start the local server, open `http://localhost:8888/server/index.html` in the browser which should redirect you to the Spotify authorization page. Grant access to the app. Spotify will redirect you to `http://localhost:8888/server/callback/index.html` where you will be shown an access code. Create a file named `credentials.json` in the root of the project, and copy the access code, client id, and client secret into it. It should look like this...

```javascript
{
    "client_id" : "<Client ID>",
    "client_secret" : "<Client Secret>",
    "authorization_code" : "<Authorization Code>"
}
```

Now run `node run.js` in the project root. After, you should have a json file of recently played tracks in the `/data` folder. From here, you can setup Windows Task Manager or linux crontab to run the task every half hour. This is how I setup crontab...

```crontab
0 * * * * /home/dom/.nvm/versions/node/v10.15.0/bin/node /home/dom/projects/Spotify/run.js
30 * * * * /home/dom/.nvm/versions/node/v10.15.0/bin/node /home/dom/projects/Spotify/run.js
```

# Tutorial

This tutorial will demonstrate how to use the Spotify API to keep track of your Spotify listening history. Since Spotify can't return your complete listening history, we'll build a script that periodically downloads [your recently played tracks](https://developer.spotify.com/documentation/web-api/reference/player/get-recently-played/) and saves them to a file. This script can be run with a task scheduler so you will always have a record of your latest play history. In a future post I'll show how to [wrangle](https://en.wikipedia.org/wiki/Data_wrangling) the data into a format we can more easily analyze.

As we go forward, I'll assume you have cloned the [dgendill/spotify-play-history](https://github.com/dgendill/spotify-play-history) repo. If you don't care how this whole system works and just want to download your history, you can skip to the project's [Quick Start](https://github.com/dgendill/spotify-play-history#quick-start)).

We'll be using Nodejs to write a script that uses the [Authorization Code Flow](https://developer.spotify.com/documentation/general/guides/authorization-guide/#authorization-code-flow). We will manually run steps 1-2 of the flow. After that, steps 3 and 4 will be run by the script.

To start, we'll create a new app in the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard/applications). We'll edit the app's settings and change the Redirect URI to http://localhost:8888/callback. This can be found by clicking the "Edit Settings" button.

After setup, Spotify will give us a Client ID and Client Secret. We'll put the Client ID in an html document that will redirect to the Spotify authorization page (Step 1 of the Authorization Code Flow). This file can be found in `server/index.html`.

```html
<html>
<head>
    <script>
    // Tell spotify we want access to the user's
    // recently played tracks
    var scopes = 'user-read-recently-played';

    // Tell spotify which app is requesting access
    var my_client_id = '<Client ID>';
    var redirect_uri = 'http://localhost:8888/callback';

    // Build the URL where Spotify will ask the user to
    // authorize our app
    var url = 'https://accounts.spotify.com/authorize' +
        '?response_type=code' +
        '&client_id=' + my_client_id +
        (scopes ? '&scope=' + encodeURIComponent(scopes) : '') +
        '&redirect_uri=' + encodeURIComponent(redirect_uri);

    // Redirect the authorization url
    window.location = url;
    </script>
</head>
<body>
    <h1>Wait for Redirect...</h1>
</body>
</html>
```

We also created `server/callback/index.html` where Spotify will redirect after the user authorizes.

```html
<html>
<head>
<script>
    document.addEventListener(
        "DOMContentLoaded",
        function(event) {

            // This page is where the user will be redirected to. The
            // url will have a ?code query parameter:
            // http://localhost:8888/callback/?code=LongRandomString

            var code = window.location.search.split('=')[1]
            document.getElementById('details').innerHTML = code;
        }
    );
</script>
</head>
<body>
    <h1>Authorization Code:</h1>
    <pre style="white-space:pre-wrap;" id="details"></pre>
</body>
</html>
```

Now that we have built our server files, we can start the server and open the browser to http://localhost:8888. I'll be using the [http-server](https://www.npmjs.com/package/http-server) package to start the server.

```language-bash
http-server ./server -p 8888 -o
```

You should see a Spotify page asking you to authorizing the app. After authorizing it, you will be redirected to the callback page and given an access code. Save this code, the client id, and the client secret to a new file named `credentials.json` in the project root.

```javascript
{
    "client_id" : "<Client ID>",
    "client_secret" : "<Client Secret>",
    "authorization_code" : "<Authorization Code>"
}
```

We then create the [run.js](https://github.com/dgendill/spotify-play-history/blob/master/run.js) file which will query the API and save data to your file system. We first make an API call to `/api/token` using the Authorization Code, Client ID, and Client Secret.

(Note that I'm using [request](https://www.npmjs.com/package/request) for making http requests, and [btoa](https://www.npmjs.com/package/btoa) for base 64 encoding.)

```javascript
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
```

This API call will return a refresh token that will be saved to `authorization.json`. We'll use the refresh token to make another API call to get an access token. We'll then use the access token to get the most recently played tracks.

Here's how we get an access token using the refresh token...

```javascript
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
```

And here is how we get the most recent tracks using the access token...

```javascript
// String -> ISO8601(UTC)String -> Promise Error { items : Array TrackInfo }
// Get all tracks after a specific date and time
function GetRecentTracks(access_token, afterTimestamp) {
    return new Promise(function(resolve, reject) {

        if (afterTimestamp) {
            console.log("Getting tracks after " + new Date(afterTimestamp).toLocaleString());
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
```

Those are the essentials pieces of interacting with the API. After making the requests, we save the server response to a new file using the [fs module](https://nodejs.org/api/fs.html).

```javascript
function saveNew(tracks) {

    var directory = __dirname + '/data';
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
```

Note that we save the tracks to a timestamped file and a file named `latest.json`. We use `latest.json` so we can easily get the timestamp of the most recently played track. Using this timestamp, we can query the API and only ask for tracks that were played after that timestamp. This minimizes the storage space we use by only requesting and saving new tracks.

There's some more logic in how the files are saved and how the API is queried. If you'd like to see how everything is wired up, see the complete [run.js](https://github.com/dgendill/spotify-play-history/blob/master/run.js) file. If you have questions or comments feel free to contact me in the comments below or open a pull request on github.