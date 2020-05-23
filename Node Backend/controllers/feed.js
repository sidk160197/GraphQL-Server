const { validationResult } = require("express-validator/check");
const fs = require('fs');
const path = require('path');

const Post = require("../models/post");
const User = require("../models/user");
const io = require('../socket');

exports.getPosts = (req, res, next) => {
  const currentPage = req.query.page || 1;
  const perPage = 2;
  let totalItems;
  Post.find().countDocuments()
    .then(count => {
      totalItems = count;
      return Post.find().populate('creator').sort({ createdAt: -1 }).skip((currentPage - 1) * perPage).limit(perPage);
    })
    .then(posts => {
      res.status(200).json({
        message: 'Posts fetched',
        posts: posts,
        totalItems: totalItems
      })
    })
    .catch(err => {
      if(!err.statusCode) {
        err.status = 500;
      }
      next(err);
    })
};

exports.createPost = (req, res, next) => {
  let creator;
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const error = new Error('Validation failed');
    error.statusCode = 422;
    throw error; 
  }

  if(!req.file) {
    const error = new Error('No image found');
    error.statusCode = 422;
    throw error; 
  }
  const imageUrl = req.file.path.replace('\\', '/'); 
  const title = req.body.title;
  const content = req.body.content;
  const post = new Post({
    title: title,
    content: content,
    creator: req.userId,
    imageUrl: imageUrl
  });
  post.save()
    .then(savedPost => {

      return User.findById(req.userId);
    })
    .then(user => {
      creator = user;
      user.posts.push(post);
      return user.save();
    })
    .then(result => {
      io.getIO().emit('posts', {
        action: 'create',
        post: { ...post._doc, creator: { _id: req.userId, name: creator.name } }
      });
      res.status(201).json({
        message: "Post created successfully!",
        post: post,
        creator: {
          _id: creator._id,
          name: creator.name
        }
      });
    })
    .catch(err => {
      if(!err.statusCode) {
        err.status = 500;
      }
      next(err);
    })
  // Create post in db
};

exports.getPost = (req, res, next) => {
  const postId = req.params.postId;
  Post.findById(postId)
    .then(post => {
      if(!post) {
        const error = new Error('No post found.');
        error.statusCode(422);
        throw error;
      }
      res.status(200).json({
        message: 'Post fetched',
        post: post
      });
    })
    .catch(err => {
      if(!err.statusCode) {
        err.status = 500;
      }
      next(err);
    })
}

exports.updatePost = (req, res, next) => {
  const postId = req.params.postId;
  const title = req.body.title;
  const content = req.body.content;
  let imageUrl = req.body.image;
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const error = new Error('Validation failed');
    error.statusCode = 422;
    throw error; 
  }
  if(req.file) {
    imageUrl = req.file.path.replace('\\', '/'); 
  }
  if(!imageUrl) {
    const error = new Error('No file picked');
    error.statusCode(422);
    throw error;
  }

  Post.findById(postId).populate('creator')
    .then(post => {
      if(!post) {
        const error = new Error('No post found.');
        error.statusCode(422); 
        throw error;
      }

      if(post.creator._id.toString() !== req.userId) {
        const error = new Error('Not Authorized.');
        error.statusCode(403);
        throw error;
      }

      if(imageUrl !== post.imageUrl) {
        clearImage(post.imageUrl);
      }

      post.title = title;
      post.imageUrl = imageUrl;
      post.content = content;
      return post.save();
    })
    .then(result => {
      io.getIO().emit('posts', {
        action: 'update',
        post: result
      })
      res.status(200).json({
        message: 'Post updated',
        post: result
      });
    })
    .catch(err => {
      if(!err.statusCode) {
        err.status = 500;
      }
      next(err);
    })
}

exports.deletePost = (req, res, next) => {
  const postId = req.params.postId;
  Post.findById(postId)
    .then(post => {
      if(!post) {
        const error = new Error('No post found.');
        error.statusCode(422);
        throw error;
      }

      if(post.creator.toString !== req.userId) {
        const error = new Error('Not Authorized.');
        error.statusCode(403);
        throw error;
      }
      clearImage(post.imageUrl);
      return Post.findByIdAndRemove(postId);
    })
    .then(result => {
      console.log(result);
      return User.findById(req.userId);
    })
    .then(user => {
      user.posts.pull(postId);
      return user.save();
    })
    .then(result => {
      io.getIO().emit('posts', {
        action: 'delete',
        post: postId
      })
      res.status(200).json({
        message: 'Post deleted.'
      });
    })
    .catch(err => {
      if(!err.statusCode) {
        err.status = 500;
      }
      next(err);
    })
}

const clearImage = filePath => {
  filePath = path.join(__dirname, '..', filePath);
  fs.unlink(filePath, err => {
    if(err) {
      console.log(err);
    }
  })
}