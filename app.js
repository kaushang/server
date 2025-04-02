const express = require("express");
const app = express();
const path = require("path");
const port = 3000;
const userModel = require("./models/userModel");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");
const postModel = require("./models/postModel");
const mongoose = require("mongoose");
require("dotenv").config();

mongoose
  .connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
  })
  .then(() => console.log("MongoDB connected"))
  .catch((err) => console.error(err));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
// app.set("view engine", "ejs");
app.use(express.static(path.join(__dirname, "/client/dist")));
app.use(cookieParser());

app.get("/api/home", isLoggedIn, async (req, res) => {
  const user = await userModel.findOne({ email: req.user.email });
  const posts = await postModel.find().populate("user", "username"); // Fetch usernames
  res.status(200).json({ user, posts });
});
app.post("/api/create", async (req, res) => {
  const { email, username, name, password } = req.body;
  const alreadyCreated = await userModel.findOne({ email });
  const usernameTaken = await userModel.findOne({ username });
  if (alreadyCreated) {
    return res.status(400).json({ message: "User already exists" });
  } else if (usernameTaken) {
    return res
      .status(400)
      .json({ message: "Username is taken. Try choosing a different one" });
  } else {
    bcrypt.genSalt(10, (err, salt) => {
      bcrypt.hash(password, salt, async (err, hash) => {
        await userModel.create({
          email,
          username,
          name,
          password: hash,
        });
        let token = jwt.sign({ email }, "xyz");
        res.cookie("token", token);
        return res.status(200).json({ message: "User created" });
      });
    });
  }
});

app.post("/api/login", isLoggedIn, async (req, res) => {
  const user = await userModel.findOne({ email: req.body.email });
  if (!user) {
    return res.status(404).json({ message: "User does not exist" });
  } else {
    bcrypt.compare(req.body.password, user.password, (err, result) => {
      if (result) {
        let token = jwt.sign({ email: user.email }, "xyz");
        res.cookie("token", token);
        res.cookie("token", token, {
          httpOnly: true, // Prevent access from JavaScript
          sameSite: "None", // Required if frontend and backend are on different origins
        });

        res.status(200).json({ message: "Seccuessfully logged in" });
      } else {
        return res.status(400).json({ message: "Wrong email or password" });
      }
    });
  }
});

app.get("/api/logout", (req, res) => {
  res.cookie("token", "");
  return res.status(200).json({ message: "Logged out" });
});

app.get("/api/post", isLoggedIn, async (req, res) => {
  const user = await userModel.findOne({ email: req.user.email });
  const posts = await postModel
    .find({ user: user._id })
    .populate("user", "username");

  res.status(200).json({ posts, user });
});
app.post("/api/post", isLoggedIn, async (req, res) => {
  const user = await userModel.findOne({ email: req.user.email });
  const post = await postModel.create({
    user: user._id,
    content: req.body.content,
    likes: [],
  });
  user.posts.push(post._id);
  await user.save();

  const posts = await postModel
    .find({ user: user._id })
    .populate("user", "username")
    .select("content user likes comments date");
  res.status(200).json({ posts });
});

app.get("/api/delete/:id", isLoggedIn, async (req, res) => {
  try {
    const user = await userModel.findOne({ email: req.user.email });
    const post = await postModel.findById(req.params.id);
    await postModel.findByIdAndDelete(req.params.id);
    await userModel.updateOne(
      { _id: post.user },
      { $pull: { posts: req.params.id } } // Remove the post ID from the array
    );
    res.status(200).json({ posts: user.posts });
  } catch (error) {
    res.status(404).json({ error });
  }
});

app.post("/api/like/:postId", async (req, res) => {
  try {
    const { postId } = req.params;
    const { userId } = req.body;

    const post = await postModel.findById(postId);

    if (!post) {
      return res.status(404).json({ message: "Post not found" });
    }
    const userIdString = userId.toString();
    const likeIndex = post.likes.findIndex(
      (id) => id.toString() === userIdString
    );

    if (likeIndex === -1) {
      post.likes.push(userIdString);
      await post.save();
      res.status(200).json({
        likes: post.likes.length,
        message: "liked",
      });
    } else {
      post.likes.splice(likeIndex, 1);
      await post.save();
      res.status(200).json({
        likes: post.likes.length,
        message: "unliked",
      });
    }
  } catch (error) {
    console.error("Like/Unlike error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});
app.get("/api/comment/:postId", isLoggedIn, async (req, res) => {
  const { postId } = req.params;
  const post = await postModel.findById(postId).populate("user", "username");
  res.status(200).json({ post });
});
app.post("/api/comment/:postId", isLoggedIn, async (req, res) => {
  const user = await userModel.findOne({ email: req.user.email });
  const postId = req.params.postId;
  const { content } = req.body;

  const comment = await postModel.findByIdAndUpdate(
    postId,
    {
      $push: {
        comments: {
          commentUsername: user.username,
          commentUser: user.userId,
          commentContent: content,
          commentDate: new Date(),
        },
      },
    },
    { new: true }
  );
  res.status(200).json({ message: "Comment published", comment });
});
app.get("/api/post/:postId", isLoggedIn, async (req, res) => {
  const post = await postModel
    .findById(req.params.postId)
    .populate("user", "username");
  res.status(200).json({ post });
});
app.post("/api/delete/comment/:postId", isLoggedIn, async (req, res) => {
  const post = await postModel.findById(req.params.postId);
  post.comments = post.comments.filter(
    (comment) => comment._id.toString() !== req.body.commentId
  );
  await post.save();
  res.status(200).json({ message: "Commment deleted", post });
});

function isLoggedIn(req, res, next) {
  if (!req.cookies || !req.cookies.token) {
    req.user = { status: "Not logged in" };
    next();
  } else {
    let data = jwt.verify(req.cookies.token, "xyz");
    req.user = data;
    next();
  }
}
app.get("/api/auth", isLoggedIn, (req, res) => {
  if (req.user.email) {
    res.status(200).json({ message: "Logged In" });
  } else {
    res.status(404).json({ message: "No Logged In" });
  }
});

app.listen(port, "0.0.0.0", () => {
  console.log(`Server running at port: http://localhost:${port}/`);
});
