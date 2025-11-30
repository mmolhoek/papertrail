import { OnboardingService } from '../OnboardingService';
import { IConfigService, IWiFiService, IEpaperService } from '@core/interfaces';
import { success, failure } from '@core/types';
import { OnboardingError, WiFiError, DisplayError, DisplayErrorCode } from '@core/errors';
import { DisplayUpdateMode } from '@core/types';

// Mock the EPD class
jest.mock('../../epaper/EPD', () => {
  return {
    EPD: jest.fn().mockImplementation(() => ({
      loadImageInBuffer: jest.fn().mockResolvedValue(Buffer.alloc(48000)),
    })),
  };
});

describe('OnboardingService', () => {
  let onboardingService: OnboardingService;
  let mockConfigService: jest.Mocked<IConfigService>;
  let mockWiFiService: jest.Mocked<IWiFiService>;
  let mockEpaperService: jest.Mocked<IEpaperService>;

  beforeEach(() => {
    // Reset the EPD mock to default state
    const { EPD } = require('../../epaper/EPD');
    EPD.mockClear();
    EPD.mockImplementation(() => ({
      loadImageInBuffer: jest.fn().mockResolvedValue(Buffer.alloc(48000)),
    }));
    // Create mock services
    mockConfigService = {
      isOnboardingCompleted: jest.fn().mockReturnValue(false),
      setOnboardingCompleted: jest.fn(),
      save: jest.fn().mockResolvedValue(success(undefined)),
    } as any;

    mockWiFiService = {
      initialize: jest.fn().mockResolvedValue(success(undefined)),
      dispose: jest.fn().mockResolvedValue(undefined),
      isConnected: jest.fn().mockResolvedValue(success(false)),
      saveNetwork: jest.fn().mockResolvedValue(success(undefined)),
      connect: jest.fn().mockResolvedValue(success(undefined)),
      disconnect: jest.fn().mockResolvedValue(success(undefined)),
      scanNetworks: jest.fn().mockResolvedValue(success([])),
      getCurrentConnection: jest.fn().mockResolvedValue(success(null)),
      getSavedNetworks: jest.fn().mockResolvedValue(success([])),
      removeNetwork: jest.fn().mockResolvedValue(success(undefined)),
      onConnectionChange: jest.fn().mockReturnValue(() => {}),
    } as any;

    mockEpaperService = {
      initialize: jest.fn().mockResolvedValue(success(undefined)),
      dispose: jest.fn().mockResolvedValue(undefined),
      displayBitmap: jest.fn().mockResolvedValue(success(undefined)),
      displayBitmapFromFile: jest.fn().mockResolvedValue(success(undefined)),
      clear: jest.fn().mockResolvedValue(success(undefined)),
      fullRefresh: jest.fn().mockResolvedValue(success(undefined)),
      sleep: jest.fn().mockResolvedValue(success(undefined)),
      wake: jest.fn().mockResolvedValue(success(undefined)),
      getStatus: jest.fn().mockResolvedValue(
        success({
          initialized: true,
          busy: false,
          sleeping: false,
          width: 800,
          height: 480,
          model: 'EPD_7IN5_V2',
          fullRefreshCount: 0,
          partialRefreshCount: 0,
          lastUpdate: new Date(),
        }),
      ),
    } as any;

    onboardingService = new OnboardingService(
      mockConfigService,
      mockWiFiService,
      mockEpaperService,
    );
  });

  describe('isOnboardingRequired', () => {
    it('should return true when onboarding is not completed', async () => {
      mockConfigService.isOnboardingCompleted.mockReturnValue(false);

      const result = await onboardingService.isOnboardingRequired();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe(true);
      }
      expect(mockConfigService.isOnboardingCompleted).toHaveBeenCalled();
    });

    it('should return false when onboarding is completed', async () => {
      mockConfigService.isOnboardingCompleted.mockReturnValue(true);

      const result = await onboardingService.isOnboardingRequired();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe(false);
      }
    });

    it('should handle errors gracefully', async () => {
      mockConfigService.isOnboardingCompleted.mockImplementation(() => {
        throw new Error('Config error');
      });

      const result = await onboardingService.isOnboardingRequired();

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBeInstanceOf(OnboardingError);
      }
    });
  });

  describe('startOnboarding', () => {
    it('should complete full onboarding flow successfully', async () => {
      // Mock WiFi connection success
      mockWiFiService.isConnected
        .mockResolvedValueOnce(success(false)) // Initial check
        .mockResolvedValueOnce(success(true)); // Connected after waiting

      const result = await onboardingService.startOnboarding({
        wifiTimeoutMs: 15000,
        welcomeDelayMs: 100,
      });

      expect(result.success).toBe(true);

      // Verify WiFi network was saved
      expect(mockWiFiService.saveNetwork).toHaveBeenCalledWith({
        ssid: 'Papertrail-Setup',
        password: 'papertrail123',
        priority: 999,
        autoConnect: true,
      });

      // Verify e-paper display was called for all screens
      expect(mockEpaperService.displayBitmapFromFile).toHaveBeenCalledTimes(3);
    });

    it('should handle WiFi connection timeout gracefully', async () => {
      // Mock WiFi never connecting
      mockWiFiService.isConnected.mockResolvedValue(success(false));

      const result = await onboardingService.startOnboarding({
        wifiTimeoutMs: 1000, // Short 1 second timeout for testing
        welcomeDelayMs: 100,
      });

      // Should still succeed (doesn't fail on timeout)
      expect(result.success).toBe(true);

      // Should have displayed welcome and instructions (but not connected screen)
      expect(mockEpaperService.displayBitmapFromFile).toHaveBeenCalledTimes(2);
    });

    it('should continue if WiFi config save fails', async () => {
      mockWiFiService.saveNetwork.mockResolvedValue(
        failure(WiFiError.unknown('Save failed')),
      );
      mockWiFiService.isConnected.mockResolvedValue(success(true));

      const result = await onboardingService.startOnboarding({
        wifiTimeoutMs: 10000,
        welcomeDelayMs: 100,
      });

      // Should still complete successfully
      expect(result.success).toBe(true);
    });

    it('should continue if display fails', async () => {
      mockEpaperService.displayBitmap.mockResolvedValue(
        failure(DisplayError.updateFailed(new Error('Display error'))),
      );
      mockWiFiService.isConnected.mockResolvedValue(success(true));

      const result = await onboardingService.startOnboarding({
        wifiTimeoutMs: 10000,
        welcomeDelayMs: 100,
      });

      // Should still complete successfully
      expect(result.success).toBe(true);
    });

    it('should handle unexpected errors', async () => {
      mockWiFiService.saveNetwork.mockImplementation(() => {
        throw new Error('Unexpected error');
      });

      const result = await onboardingService.startOnboarding({
        wifiTimeoutMs: 10000,
        welcomeDelayMs: 100,
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBeInstanceOf(OnboardingError);
      }
    });
  });

  describe('completeOnboarding', () => {
    it('should mark onboarding as completed and save', async () => {
      const result = await onboardingService.completeOnboarding();

      expect(result.success).toBe(true);
      expect(mockConfigService.setOnboardingCompleted).toHaveBeenCalledWith(true);
      expect(mockConfigService.save).toHaveBeenCalled();
    });

    it('should fail if config save fails', async () => {
      mockConfigService.save.mockResolvedValue(
        failure(new Error('Save failed') as any),
      );

      const result = await onboardingService.completeOnboarding();

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBeInstanceOf(OnboardingError);
      }
    });

    it('should handle unexpected errors', async () => {
      mockConfigService.setOnboardingCompleted.mockImplementation(() => {
        throw new Error('Unexpected error');
      });

      const result = await onboardingService.completeOnboarding();

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBeInstanceOf(OnboardingError);
      }
    });
  });

  describe('displayInstructions', () => {
    it('should display WiFi instructions successfully', async () => {
      const result = await onboardingService.displayInstructions();

      expect(result.success).toBe(true);
      expect(mockEpaperService.displayBitmapFromFile).toHaveBeenCalled();

      // Verify the correct file path and mode were passed
      const call = mockEpaperService.displayBitmapFromFile.mock.calls[0];
      expect(call[0]).toContain('wifi-instructions.bmp');
      expect(call[1]).toBe(DisplayUpdateMode.FULL);
    });

    it('should handle display errors', async () => {
      mockEpaperService.displayBitmapFromFile.mockResolvedValue(
        failure(DisplayError.updateFailed(new Error('Display error'))),
      );

      const result = await onboardingService.displayInstructions();

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBeInstanceOf(OnboardingError);
      }
    });

    it('should handle file not found errors', async () => {
      // Mock displayBitmapFromFile to return file not found error
      mockEpaperService.displayBitmapFromFile.mockResolvedValue(
        failure(
          new DisplayError(
            'Image file not found',
            DisplayErrorCode.RENDER_FAILED,
            true,
          ),
        ),
      );

      const result = await onboardingService.displayInstructions();

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBeInstanceOf(OnboardingError);
        expect((result.error as OnboardingError).code).toBe('ONBOARDING_IMAGE_NOT_FOUND');
      }
    });
  });

  describe('WiFi connection waiting', () => {
    it('should detect WiFi connection immediately if already connected', async () => {
      mockWiFiService.isConnected.mockResolvedValue(success(true));

      const result = await onboardingService.startOnboarding({
        wifiTimeoutMs: 10000,
        welcomeDelayMs: 100,
      });

      expect(result.success).toBe(true);
      // Should have displayed all three screens
      expect(mockEpaperService.displayBitmapFromFile).toHaveBeenCalledTimes(3);
    });

    it('should poll for WiFi connection periodically', async () => {
      let callCount = 0;
      mockWiFiService.isConnected.mockImplementation(async () => {
        callCount++;
        // Connect after 2 checks (to keep test fast)
        return success(callCount >= 2);
      });

      const result = await onboardingService.startOnboarding({
        wifiTimeoutMs: 20000,
        welcomeDelayMs: 100,
      });

      expect(result.success).toBe(true);
      // Should have called isConnected multiple times (at least 2)
      expect(mockWiFiService.isConnected).toHaveBeenCalled();
      expect(callCount).toBeGreaterThanOrEqual(2);
      // Should have displayed all three screens
      expect(mockEpaperService.displayBitmapFromFile).toHaveBeenCalledTimes(3);
    }, 15000); // Increase timeout to 15 seconds to allow for polling
  });

  describe('Error handling for display screens', () => {
    it('should handle missing image files gracefully', async () => {
      const { EPD } = require('../../epaper/EPD');
      EPD.mockImplementation(() => ({
        loadImageInBuffer: jest.fn().mockRejectedValue({
          message: 'ENOENT: no such file',
        }),
      }));

      const service = new OnboardingService(
        mockConfigService,
        mockWiFiService,
        mockEpaperService,
      );

      // Should continue despite missing images
      mockWiFiService.isConnected.mockResolvedValue(success(true));

      const result = await service.startOnboarding({
        wifiTimeoutMs: 10000,
        welcomeDelayMs: 100,
      });

      // Should still succeed (onboarding continues despite display failures)
      expect(result.success).toBe(true);
    });
  });
});
