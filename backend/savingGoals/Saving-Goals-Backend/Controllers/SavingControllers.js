const User = require("../Model/SavingModel");

//Data Display

const getAllUsers = async (req, res, next) => {
    let Users;

    try{
        users = await User.find();

    }catch (err) {
        console.log(err);
    }
    //not found
    if (!users) {
        return res.status(404).json({ message: "User not found"});
    }
    //Display all users
    return res.status(200).json({users });
};


//data Insert
const addUsers =async (req, res, next) => {
    const {name,targetAmount,targetDate} = req.body;

    let users;

    try{
        users = new User({name,targetAmount,targetDate});
        await users.save();
    }catch (err) {
        console.log(err);
    }
    //not insert users
    if (!users){
        return res.status(404).json({message:"unable to add users"});
    }
    return res.status(200).json({users});
};

//Get by ID
const getById = async (req, res, next) => {

    const id = req.params.id;

    let user;

    try {
        users = await User.findById(id);
    }catch (err) {
        console.log(err);
    }
    //not available users
    if (!users){
        return res.status(404).json({message:"User not found"});
    }
    return res.status(200).json({users});
}

//Update User Details
const updateUser = async (req, res, next) => {

    const id = req.params.id;
    const {name, targetAmount,targetDate} = req.body;

    let users;

    try {
        users = await User.findByIdAndUpdate(id,
            { name: name, targetAmount: targetAmount, targetDate: targetDate});
            users = await users.save();
    }catch(err) {
        console.log(err);
    }
    //not available users
    if (!users){
        return res.status(404).json({message:"Unable to Update User Details"});
    }
    return res.status(200).json({users});
};

//Delete User Details
const deleteUser = async (req, res, next) => {
    const id = req.params.id;

    let user;

    try{
        user = await User.findByIdAndDelete(id)
    }catch (err) {
        console.log(err);
    }

    if (!user){
        return res.status(404).json({message:"Unable to delete User Details"});
    }
    return res.status(200).json({user});
}
exports.getAllUsers = getAllUsers;
exports.addUsers = addUsers;
exports.getById = getById;
exports.updateUser = updateUser;
exports.deleteUser = deleteUser;