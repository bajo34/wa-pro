import User from "../../models/User";
import AppError from "../../errors/AppError";
import {
  createAccessToken,
  createRefreshToken
} from "../../helpers/CreateTokens";
import { SerializeUser } from "../../helpers/SerializeUser";
import Queue from "../../models/Queue";

interface SerializedUser {
  id: number;
  name: string;
  email: string;
  profile: string;
  queues: Queue[];
}

interface Request {
  email: string;
  password: string;
}

interface Response {
  serializedUser: SerializedUser;
  token: string;
  refreshToken: string;
}

const AuthUserService = async ({
  email,
  password
}: Request): Promise<Response> => {
  // IMPORTANT:
  // In some Railway setups the DB may be partially migrated (or associations may
  // not match the existing schema). Including "queues" during login can throw a
  // Sequelize error which surfaces as a 500 and blocks all logins. We therefore
  // fetch the user first, then attempt to load queues in a best-effort way.
  const user = await User.findOne({
    where: { email }
  });

  if (!user) {
    throw new AppError("ERR_INVALID_CREDENTIALS", 401);
  }

  if (!(await user.checkPassword(password))) {
    throw new AppError("ERR_INVALID_CREDENTIALS", 401);
  }

  let userWithQueues = user;
  try {
    userWithQueues = (await User.findByPk(user.id, {
      include: ["queues"]
    })) as User;
  } catch (_err) {
    // Best effort: login should still work even if queues association fails.
  }

  const token = createAccessToken(user);
  const refreshToken = createRefreshToken(user);

  const serializedUser = SerializeUser(userWithQueues);

  return {
    serializedUser,
    token,
    refreshToken
  };
};

export default AuthUserService;
