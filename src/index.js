import dotenv from "dotenv";
dotenv.config({ path: "./env" });

import connectDB from "./db/index.js";
import { app } from "./app.js";

connectDB()
	.then(() => {
		app.on("error", (error) => {
			console.log("Something Unexpected Happened, Error:: ", error);
			throw error;
		});
		app.listen(process.env.PORT || 3000, () => {
			console.log(`Server Running at Port  ${process.env.PORT || 3000}`);
		});
	})
	.catch((err) => {
		console.log("DB Connection Failed :: Error -> ", err);
		process.exit(1);
	});
