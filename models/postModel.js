const mongoose = require('mongoose');

const postSchema = mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "user"
    },
    date: {
        type: Date,
        default: Date.now
    },
    likes: [
        {
            type: String,
            ref: 'user'
        }
    ],
    comments: [
        {
            commentUsername: String,
            commentUser: { 
                type: String,
                ref: 'user' 
            },
            commentContent: String,
            commentDate: {
                type: Date,
                default: Date.now
            }
        }
    ],
    content: String
});
module.exports = mongoose.model("post", postSchema);