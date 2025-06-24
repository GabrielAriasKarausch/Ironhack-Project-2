const express = require('express'),
      async = require('async'),
      { Pool } = require('pg'),
      cookieParser = require('cookie-parser'),
      path = require('path'),
      app = express(),
      server = require('http').Server(app),
      io = require('socket.io')(server, { path: '/result/socket.io' });

const port = process.env.PORT || 4000;

// Namespaces for Socket.IO
const rootNamespace = io.of('/');
const resultNamespace = io.of('/result');

rootNamespace.on('connection', socket => {
  console.log("Connected on root namespace");
  socket.emit('message', { text: 'Welcome from root!' });
  socket.on('subscribe', data => socket.join(data.channel));
});

resultNamespace.on('connection', socket => {
  console.log("Connected on /result namespace");
  socket.emit('message', { text: 'Welcome from result!' });
  socket.on('subscribe', data => socket.join(data.channel));
});

// --- PostgreSQL logic using DATABASE_URL ---
const connectionString = process.env.DATABASE_URL;
console.log("Connecting to DB:", connectionString);

const pool = new Pool({ connectionString });

async.retry(
  { times: 1000, interval: 1000 },
  function (callback) {
    pool.connect((err, client, done) => {
      if (err) {
        console.error("Waiting for db");
      }
      callback(err, client);
    });
  },
  function (err, client) {
    if (err) {
      return console.error("Giving up");
    }
    console.log("Connected to db");
    getVotes(client);
  }
);

function getVotes(client) {
  client.query('SELECT vote, COUNT(id) AS count FROM votes GROUP BY vote', [], (err, result) => {
    if (err) {
      console.error("Error performing query: " + err);
    } else {
      const votes = collectVotesFromResult(result);
      rootNamespace.emit("scores", JSON.stringify(votes));
      resultNamespace.emit("scores", JSON.stringify(votes));
    }
    setTimeout(() => getVotes(client), 1000);
  });
}

function collectVotesFromResult(result) {
  const votes = { a: 0, b: 0 };
  result.rows.forEach(row => {
    votes[row.vote] = parseInt(row.count);
  });
  return votes;
}

// Middleware and routes
app.use(cookieParser());
app.use(express.urlencoded({ extended: true }));

app.use(express.static(path.join(__dirname, 'views')));
app.use("/result", express.static(path.join(__dirname, 'views')));

app.get(['/', '/result'], (req, res) => {
  res.sendFile(path.resolve(__dirname, 'views', 'index.html'));
});

server.listen(port, () => {
  console.log('App running on port ' + server.address().port);
});
