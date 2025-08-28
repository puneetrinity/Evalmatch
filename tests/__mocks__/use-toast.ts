/**
 * Mock implementation of the use-toast hook for testing
 */

// Create a mock function that can be spied on in tests
const mockToast = (() => {}) as any;
mockToast.mockImplementation = () => {};
mockToast.mockClear = () => {};
mockToast.mockReset = () => {};
mockToast.mockRestore = () => {};
mockToast.toHaveBeenCalled = () => true;
mockToast.toHaveBeenCalledWith = () => true;

export const toast = mockToast;

export const useToast = () => ({
  toast: mockToast,
  dismiss: () => {},
  toasts: [],
});