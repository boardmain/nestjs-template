import * as speakeasy from 'speakeasy';
import * as QRCode from 'qrcode';
import { Injectable, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { User } from '../entities/user.entity';
import { Otp } from '../entities/otp.entity';
import { RefreshToken } from '../entities/refresh-token.entity';
import { IUserRepository } from '../repositories/user.repository.interface';
import { IOtpRepository } from '../repositories/otp.repository.interface';
import { IRefreshTokenRepository } from '../repositories/refresh-token.repository.interface';
import {
  EntityNotFoundException,
  OtpExpiredException,
  OtpInvalidException,
  AuthenticationException
} from '@core/exceptions/domain-exceptions';
import { Email } from '@core/value-objects/email.vo';

@Injectable()
export class AuthService {
  constructor(
    @Inject('UserRepository')
    private readonly userRepository: IUserRepository,
    @Inject('OtpRepository')
    private readonly otpRepository: IOtpRepository,
    @Inject('RefreshTokenRepository')
    private readonly refreshTokenRepository: IRefreshTokenRepository,
    private readonly configService: ConfigService,
  ) {}

  private get otpConfig() {
    return {
      secret: this.configService.get<string>('OTP_SECRET'),
      expiration: this.configService.get<number>('OTP_EXPIRATION', 5),
      step: this.configService.get<number>('OTP_STEP', 30),
      digits: this.configService.get<number>('OTP_DIGITS', 6),
    };
  }

  private get tokenConfig() {
    return {
      refreshExpiration: parseInt(
        this.configService.get<string>('JWT_REFRESH_EXPIRATION', '7d').replace('d', ''),
        10
      ),
    };
  }

  async generateOtp(userId: string): Promise<string> {
    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw new EntityNotFoundException('User', userId);
    }

    // Generate a temporary secret
    const secret = speakeasy.generateSecret({
      length: 20,
      name: `App:${user.email}`,
    }).base32;

    // Create a new OTP entity
    const otp = new Otp(
      userId,
      secret,
      this.otpConfig.expiration,
    );

    // Save the OTP
    await this.otpRepository.create(otp);

    // Generate a token using the secret
    return speakeasy.totp({
      secret,
      encoding: 'base32',
      step: this.otpConfig.step,
      digits: this.otpConfig.digits,
    });
  }

  async verifyOtp(userId: string, token: string): Promise<boolean> {
    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw new EntityNotFoundException('User', userId);
    }

    const otp = await this.otpRepository.findByUserId(userId);
    if (!otp) {
      throw new EntityNotFoundException('OTP');
    }

    if (otp.isExpired()) {
      throw new OtpExpiredException();
    }

    const isValid = speakeasy.totp.verify({
      secret: otp.secret,
      encoding: 'base32',
      token,
      step: this.otpConfig.step,
      digits: this.otpConfig.digits,
    });

    if (isValid) {
      otp.markAsVerified();
      await this.otpRepository.update(otp);
      return true;
    } else {
      throw new OtpInvalidException();
    }
  }

  async setupTwoFactorAuth(userId: string): Promise<{ secret: string, qrCodeUrl: string }> {
    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw new EntityNotFoundException('User', userId);
    }

    // Generate a new secret
    const secret = speakeasy.generateSecret({
      length: 20,
      name: `App:${user.email}`,
    });

    // Save the secret to the user
    user.enableOtp(secret.base32);
    await this.userRepository.update(user);

    // Generate QR code
    const qrCodeUrl = await QRCode.toDataURL(secret.otpauth_url);

    return {
      secret: secret.base32,
      qrCodeUrl,
    };
  }

  async verifyTwoFactorToken(userId: string, token: string): Promise<boolean> {
    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw new EntityNotFoundException('User', userId);
    }

    if (!user.otpEnabled || !user.otpSecret) {
      throw new AuthenticationException('Two-factor authentication is not enabled for this user');
    }

    const isValid = speakeasy.totp.verify({
      secret: user.otpSecret,
      encoding: 'base32',
      token,
      step: this.otpConfig.step,
      digits: this.otpConfig.digits,
    });

    if (!isValid) {
      throw new OtpInvalidException();
    }

    return true;
  }

  async disableTwoFactorAuth(userId: string): Promise<User> {
    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw new EntityNotFoundException('User', userId);
    }

    user.disableOtp();
    return this.userRepository.update(user);
  }

  async createRefreshToken(userId: string, token: string): Promise<RefreshToken> {
    // Delete any existing refresh tokens for this user
    await this.refreshTokenRepository.deleteByUserId(userId);

    // Create a new refresh token
    const refreshToken = new RefreshToken(
      userId,
      token,
      this.tokenConfig.refreshExpiration,
    );

    return this.refreshTokenRepository.create(refreshToken);
  }

  async validateRefreshToken(token: string): Promise<RefreshToken> {
    const refreshToken = await this.refreshTokenRepository.findByToken(token);
    if (!refreshToken) {
      throw new AuthenticationException('Invalid refresh token');
    }

    if (refreshToken.isExpired()) {
      throw new AuthenticationException('Refresh token has expired');
    }

    if (refreshToken.isRevoked()) {
      throw new AuthenticationException('Refresh token has been revoked');
    }

    return refreshToken;
  }

  async revokeRefreshToken(token: string): Promise<void> {
    const refreshToken = await this.refreshTokenRepository.findByToken(token);
    if (!refreshToken) {
      throw new AuthenticationException('Invalid refresh token');
    }

    if (refreshToken.isRevoked()) {
      // The Token is already revoked, no action needed
      return;
    }

    refreshToken.revoke();
    await this.refreshTokenRepository.update(refreshToken);
  }

  async revokeAllRefreshTokens(userId: string): Promise<void> {
    // Check if user exists
    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw new EntityNotFoundException('User', userId);
    }

    await this.refreshTokenRepository.deleteByUserId(userId);
  }

  async updateLastLogin(userId: string): Promise<User> {
    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw new EntityNotFoundException('User', userId);
    }

    user.updateLastLogin();
    return this.userRepository.update(user);
  }
}
