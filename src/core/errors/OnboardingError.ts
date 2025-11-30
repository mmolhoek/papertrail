import { BaseError } from "./BaseError";

/**
 * Onboarding error codes
 */
export enum OnboardingErrorCode {
  ONBOARDING_FAILED = "ONBOARDING_FAILED",
  DISPLAY_FAILED = "ONBOARDING_DISPLAY_FAILED",
  WIFI_SETUP_FAILED = "ONBOARDING_WIFI_FAILED",
  TIMEOUT = "ONBOARDING_TIMEOUT",
  ALREADY_COMPLETED = "ONBOARDING_ALREADY_COMPLETED",
  IMAGE_NOT_FOUND = "ONBOARDING_IMAGE_NOT_FOUND",
}

/**
 * Onboarding service errors
 */
export class OnboardingError extends BaseError {
  constructor(
    message: string,
    public readonly code: OnboardingErrorCode,
    recoverable: boolean = false,
    context?: Record<string, any>,
  ) {
    super(message, code, recoverable, context);
  }

  /**
   * Failed to display onboarding screen
   */
  static displayFailed(error: Error, screenName?: string): OnboardingError {
    return new OnboardingError(
      `Failed to display onboarding screen${screenName ? ` "${screenName}"` : ""}: ${error.message}`,
      OnboardingErrorCode.DISPLAY_FAILED,
      true,
      { originalError: error.message, screenName },
    );
  }

  /**
   * WiFi setup failed during onboarding
   */
  static wifiSetupFailed(error: Error): OnboardingError {
    return new OnboardingError(
      `WiFi setup failed during onboarding: ${error.message}`,
      OnboardingErrorCode.WIFI_SETUP_FAILED,
      true,
      { originalError: error.message },
    );
  }

  /**
   * Onboarding timed out
   */
  static timeout(stage: string, timeoutMs: number): OnboardingError {
    return new OnboardingError(
      `Onboarding timed out at stage "${stage}" after ${timeoutMs}ms`,
      OnboardingErrorCode.TIMEOUT,
      true,
      { stage, timeoutMs },
    );
  }

  /**
   * Onboarding already completed
   */
  static alreadyCompleted(): OnboardingError {
    return new OnboardingError(
      "Onboarding has already been completed",
      OnboardingErrorCode.ALREADY_COMPLETED,
      false,
    );
  }

  /**
   * Onboarding image not found
   */
  static imageNotFound(imagePath: string): OnboardingError {
    return new OnboardingError(
      `Onboarding image not found: ${imagePath}`,
      OnboardingErrorCode.IMAGE_NOT_FOUND,
      true,
      { imagePath },
    );
  }

  /**
   * General onboarding failure
   */
  static failed(message: string): OnboardingError {
    return new OnboardingError(
      `Onboarding failed: ${message}`,
      OnboardingErrorCode.ONBOARDING_FAILED,
      true,
    );
  }
}
