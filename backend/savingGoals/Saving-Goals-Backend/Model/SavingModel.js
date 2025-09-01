const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const savingSchema = new Schema({
    name:{
        type:String, //dataType
        required:true,//validate
    },
    targetAmount:{
        type:Number, //dataType
        requied:true,//validate
    },
    targetDate:{
        type:Date, //dataType
        required:true,//validate
    }

});

module.exports = mongoose.model(
    "SavingModel",//file name
    savingSchema //function name
)