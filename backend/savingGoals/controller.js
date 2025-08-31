const User = require('./model');

// Get all users
const getUsers = async (req, res) => {
    try {
        const users = await User.find();
        res.json(users);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// Add new user
const addUser = async (req, res) => {
    try {
        const { id, name } = req.body;
        const user = new User({ id, name });
        const savedUser = await user.save();
        res.json(savedUser);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// Update user
const updateUser = async (req, res) => {
    try {
        const { id, name } = req.body;
        const updated = await User.updateOne({ id }, { $set: { name } });
        res.json(updated);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// Delete user
const deleteUser = async (req, res) => {
    try {
        const { id } = req.body;
        const deleted = await User.deleteOne({ id });
        res.json(deleted);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

module.exports = { getUsers, addUser, updateUser, deleteUser };
