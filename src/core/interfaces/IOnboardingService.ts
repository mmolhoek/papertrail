import { Result } from "../types";

/**
 * Onboarding Service Interface
 * Manages the first-boot onboarding flow for device setup
 */
export interface IOnboardingService {
  /**
   * Check if onboarding is required (first boot)
   * @returns true if onboarding needs to be completed
   */
  isOnboardingRequired(): Promise<Result<boolean>>;

  /**
   * Start the onboarding flow
   * - Display welcome screen
   * - Configure WiFi auto-connect
   * - Display WiFi instructions
   * - Wait for connection
   * - Display success screen
   * @param options Optional configuration for timeouts (useful for testing)
   */
  startOnboarding(options?: {
    wifiTimeoutMs?: number;
    welcomeDelayMs?: number;
  }): Promise<Result<void>>;

  /**
   * Mark onboarding as complete
   * Called when user finishes setup via web interface
   */
  completeOnboarding(): Promise<Result<void>>;

  /**
   * Display onboarding instructions on e-paper
   * Shows setup steps to the user
   */
  displayInstructions(): Promise<Result<void>>;
}
