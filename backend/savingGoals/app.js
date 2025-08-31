const express = require('express');   // fixed require
const app = express();
const cors = require('cors');
const controller = require('./controller');  // import your users.js

app.use(cors());

app.use(
    express.urlencoded({
        extended: true,
    })
);

app.use(express.json());

// Route: Get all users
app.get('/users', (req, res) => {
    controller.getUsers((req,res,next) => {
        res.send();
    });
});

// Route: Get user by id (using query param)
app.post('/createuser', (req, res) => {
    controller.addUser(req.body,(callback) =>{
        res.send();
    });
       
});


app.post('/updateuser', (req, res) => {
    controller.updateUser(req.body,(callback) =>{
        res.send(callback);
    });
       
});


app.post('/deleteuser', (req, res) => {
    controller.deleteUser(req.body,(callback) =>{
        res.send(callback);
    });
       
});

module.exports = app;
