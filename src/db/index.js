import mongoose from "mongoose";

const connectDB = async () => {
	try {
		const connection = await mongoose.connect(
			`${process.env.DATABASE_URI}/${process.env.DATABASE_NAME}`
		);
		console.log("DB Connected , DB HOST :: ", connection.connection.host);
	} catch (error) {
		console.log("MongoDb Connection Failed :: ", error);
	}
};

export default connectDB;
