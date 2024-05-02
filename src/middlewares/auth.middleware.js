import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import jwt from "jsonwebtoken";
import { User } from "../models/user.model.js";

export const verifyJWT = asyncHandler(async (req, res, next) => {
	try {
		const token =
			req.cookies?.accessToken ||
			req.header("Authorization")?.replace("Bearer ", "");

		if (!token) {
			throw new ApiError(401, "Unauthorized Request");
		}

		const tokenPayload = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);

		const loggedInUser = await User.findById(tokenPayload?._id).select(
			"-password -refreshToken"
		);

		if (!loggedInUser) {
			throw new ApiError(401, "Invalid Access Token");
		}

		req.user = loggedInUser;
		next();
	} catch (error) {
		throw new ApiError(401, error?.message || "Invalid Access Token");
	}
});
