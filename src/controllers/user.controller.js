import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { User } from "../models/user.model.js";
import { uploadOnCloudinary } from "../utils/Cloudinary.js";
import jwt from "jsonwebtoken";

const registerUser = asyncHandler(async (req, res) => {
	const { username, email, fullName, password } = req.body;

	if (
		[username, email, fullName, password].some((field) => field?.trim() === "")
	) {
		throw new ApiError(400, "All fields are required");
	}

	const existingUser = await User.findOne({ $or: [{ username }, { email }] });

	if (existingUser) {
		throw new ApiError(409, "User with username or email already exist");
	}

	const avatarLocalPath = req.files?.avatar[0]?.path;
	let coverImageLocalPath;
	if (
		req.files &&
		Array.isArray(req.files.coverImage) &&
		req.files.coverImage.length > 0
	) {
		coverImageLocalPath = req.files.coverImage[0].path;
	}

	if (!avatarLocalPath) {
		throw new ApiError(400, "Avatar file is required");
	}

	const avatar = await uploadOnCloudinary(avatarLocalPath);
	const coverImage = await uploadOnCloudinary(coverImageLocalPath);

	if (!avatar) {
		throw new ApiError(400, "Avatar is required");
	}

	const user = await User.create({
		username: username.toLowerCase(),
		email,
		password,
		fullName,
		avatar: avatar.url,
		coverImage: coverImage?.url || "",
	});

	const createdUser = await User.findById(user._id).select({
		password: 0,
		refreshToken: 0,
	});

	if (!createdUser) {
		throw new ApiError(500, "Something went wrong while registering the user");
	}

	return res
		.status(201)
		.json(new ApiResponse(200, createdUser, "User Created successfully"));
});

const loginUser = asyncHandler(async (req, res) => {
	// getting user input data
	const { username, email, password } = req.body;

	if (!username && !email) {
		throw new ApiError(400, "Username and email both are required");
	}
	if (!password) {
		throw new ApiError(400, "Password is required");
	}

	// finding user and checking password( if exist)
	const user = await User.findOne({ $and: [{ username }, { email }] });

	if (!user) {
		throw new ApiError(404, "User does not Exist! ");
	}

	const isPasswordCorrect = await user.comparePassword(password);

	if (!isPasswordCorrect) {
		throw new ApiError(400, "Invalid User Credentials");
	}

	// generating access and refresh Tokens
	const accessToken = user.generateAccessToken();
	const refreshToken = user.generateRefreshToken();

	user.refreshToken = refreshToken;
	const loggedInUser = await user.save({ validateBeforeSave: false });

	const newUser = await User.findById(loggedInUser._id).select(
		"-password -refreshToken"
	);

	// setting tokens in cookies

	//These options sets the cookie as server modified only (i.e can't be modified at frontend)
	const cookieOptions = {
		httpOnly: true,
		secure: true,
	};

	return res
		.status(200)
		.cookie("accessToken", accessToken, cookieOptions)
		.cookie("refreshToken", refreshToken, cookieOptions)
		.json(
			new ApiResponse(
				200,
				{
					user: newUser,
					accessToken,
					refreshToken,
				},
				"User loggedIn Successfully"
			)
		);
});

const logoutUser = asyncHandler(async (req, res) => {
	const id = req.user._id;
	await User.findByIdAndUpdate(
		id,
		{
			$set: {
				refreshToken: undefined,
			},
		},
		{
			new: true,
		}
	);

	const cookieOptions = {
		httpOnly: true,
		secured: true,
	};

	res
		.status(200)
		.clearCookie("accessToken", cookieOptions)
		.clearCookie("refreshToken", cookieOptions)
		.json(new ApiResponse(200, {}, "User Logged Out Successfully"));
});

const refreshAccessToken = asyncHandler(async (req, res) => {
	const incomingRefreshToken =
		req.cookies.refreshToken || req.body.refreshToken;

	if (!incomingRefreshToken) {
		throw new ApiError(401, "Unauthorized Request");
	}

	try {
		const decodedToken = jwt.verify(
			incomingRefreshToken,
			process.env.REFRESH_TOKEN_SECRET
		);

		const user = await User.findById(decodedToken?._id);

		if (!user) {
			throw new ApiError(401, "Invalid Refresh Token");
		}

		// matching the tokens
		if (incomingRefreshToken !== user.refreshToken) {
			throw new ApiError(401, "Refresh Token is Invalid or Expired!!");
		}

		// generating new tokens
		const newAccessToken = user.generateAccessToken();
		const newRefreshToken = user.generateRefreshToken();

		user.refreshToken = newRefreshToken;
		await user.save({ validateBeforeSave: false });

		// const updatedUser = User.findById(user._id).select("-password -refreshToken");

		const cookieOptions = {
			httpOnly: true,
			secure: true,
		};

		res
			.status(200)
			.cookie("accessToken", newAccessToken, cookieOptions)
			.cookie("refreshToken", newRefreshToken, cookieOptions)
			.json(
				new ApiResponse(
					200,
					{
						accessToken: newAccessToken,
						refreshToken: newRefreshToken,
					},
					"User loggedIn Successfully"
				)
			);
	} catch (error) {
		throw new ApiError(401, error?.message || "Invalid Refresh Token..");
	}
});

// controller to change user Password
const changeCurrentPassword = asyncHandler(async (req, res) => {
	const { oldPassword, newPassword } = req.body;

	const user = await User.findById(req.user?._id);

	const isPasswordCorrect = await user.comparePassword(oldPassword);

	if (!isPasswordCorrect) {
		throw new ApiError(400, "Incorrect Old Password");
	}

	user.password = newPassword;
	await user.save({ validateBeforeSave: false });
	return res
		.status(200)
		.json(new ApiResponse(200, {}, "Password Changed Successfully"));
});

// controller to get current user
const getCurrentUser = asyncHandler(async (req, res) => {
	const user = req.user;
	return res
		.status(200)
		.json(new ApiResponse(200, user, "Current user fetched Successfully"));
});

// controller to update fullName and email
const updateAccountDetails = asyncHandler(async (req, res) => {
	const { fullName, email } = req.body;

	if (!fullName || !email) {
		throw new ApiError(400, "All Fields are required");
	}

	const user = await User.findByIdAndUpdate(
		req.user?.id,
		{
			$set: {
				fullName,
				email,
			},
		},
		{ new: true }
	).select("-password");

	return res
		.status(200)
		.json(new ApiResponse(200, user, "Account details updated successfully"));
});

// controller to update Avatar File
const updateUserAvatar = asyncHandler(async (req, res) => {
	const avatarLocalFilePath = req.file?.path;

	if (!avatarLocalFilePath) {
		throw new ApiError(400, "Avatar Image not provided");
	}
	const avatar = await uploadOnCloudinary(avatarLocalFilePath);

	if (!avatar.url) {
		throw new ApiError(400, "Error while uploading avatar");
	}

	const user = await User.findByIdAndUpdate(
		req.user?._id,
		{
			$set: {
				avatar: avatar.url,
			},
		},
		{ new: true }
	).select("-password");

	// Todo : delete old image after  successful update from cloudinary by creating a utility fn

	return res
		.status(200)
		.json(new ApiResponse(200, user, "Avatar image updated successfully"));
});

// controller to update Cover Image
const updateUserCoverImage = asyncHandler(async (req, res) => {
	const coverImageLocalFilePath = req.file?.path;

	if (!coverImageLocalFilePath) {
		throw new ApiError(400, "Cover Image not provided");
	}
	const coverImage = await uploadOnCloudinary(coverImageLocalFilePath);

	if (!coverImage.url) {
		throw new ApiError(400, "Error while uploading cover Image");
	}

	const user = await User.findByIdAndUpdate(
		req.user?._id,
		{
			$set: {
				coverImage: coverImage.url,
			},
		},
		{ new: true }
	).select("-password");

	// Todo : delete old image from cloudinary after  successful update  by creating a utility fn

	return res
		.status(200)
		.json(new ApiResponse(200, user, "Cover Image updated successfully"));
});

export {
	registerUser,
	loginUser,
	logoutUser,
	refreshAccessToken,
	changeCurrentPassword,
	getCurrentUser,
	updateAccountDetails,
	updateUserAvatar,
	updateUserCoverImage,
};
