import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { KeyEncryptionService } from './key-encryption.service';

describe('KeyEncryptionService', () => {
  let service: KeyEncryptionService;

  const mockSecret = 'test-master-secret-at-least-32-characters-long';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        KeyEncryptionService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue(mockSecret),
          },
        },
      ],
    }).compile();

    service = module.get<KeyEncryptionService>(KeyEncryptionService);
  });

  describe('encrypt and decrypt', () => {
    it('should encrypt and decrypt a simple string', () => {
      const plaintext = 'Hello, World!';

      const encrypted = service.encrypt(plaintext);
      const decrypted = service.decrypt(encrypted);

      expect(decrypted).toBe(plaintext);
    });

    it('should encrypt and decrypt a JSON object', () => {
      const privateKey = {
        kty: 'RSA',
        n: 'some-modulus',
        e: 'AQAB',
        d: 'private-exponent',
      };
      const plaintext = JSON.stringify(privateKey);

      const encrypted = service.encrypt(plaintext);
      const decrypted = service.decrypt(encrypted);

      expect(JSON.parse(decrypted)).toEqual(privateKey);
    });

    it('should produce different ciphertext for same plaintext (random IV/salt)', () => {
      const plaintext = 'same input';

      const encrypted1 = service.encrypt(plaintext);
      const encrypted2 = service.encrypt(plaintext);

      expect(encrypted1).not.toBe(encrypted2);

      // Both should still decrypt correctly
      expect(service.decrypt(encrypted1)).toBe(plaintext);
      expect(service.decrypt(encrypted2)).toBe(plaintext);
    });

    it('should handle empty string', () => {
      const plaintext = '';

      const encrypted = service.encrypt(plaintext);
      const decrypted = service.decrypt(encrypted);

      expect(decrypted).toBe(plaintext);
    });

    it('should handle unicode characters', () => {
      const plaintext = '🔐 Šifrování is encryption in Czech 中文';

      const encrypted = service.encrypt(plaintext);
      const decrypted = service.decrypt(encrypted);

      expect(decrypted).toBe(plaintext);
    });

    it('should handle large payloads', () => {
      const plaintext = 'x'.repeat(100000);

      const encrypted = service.encrypt(plaintext);
      const decrypted = service.decrypt(encrypted);

      expect(decrypted).toBe(plaintext);
    });
  });

  describe('decrypt error handling', () => {
    it('should throw error for invalid format (missing parts)', () => {
      expect(() => service.decrypt('invalid')).toThrow('Invalid encrypted data format');
    });

    it('should throw error for tampered ciphertext', () => {
      const plaintext = 'secret data';
      const encrypted = service.encrypt(plaintext);

      // Tamper with the encrypted data
      const parts = encrypted.split(':');
      parts[3] = Buffer.from('tampered').toString('base64');
      const tampered = parts.join(':');

      expect(() => service.decrypt(tampered)).toThrow();
    });

    it('should throw error for tampered auth tag', () => {
      const plaintext = 'secret data';
      const encrypted = service.encrypt(plaintext);

      // Tamper with the auth tag
      const parts = encrypted.split(':');
      parts[2] = Buffer.from('0'.repeat(16)).toString('base64');
      const tampered = parts.join(':');

      expect(() => service.decrypt(tampered)).toThrow();
    });
  });

  describe('encryption format', () => {
    it('should produce base64 encoded parts separated by colons', () => {
      const encrypted = service.encrypt('test');
      const parts = encrypted.split(':');

      expect(parts).toHaveLength(4);

      // Each part should be valid base64
      parts.forEach((part) => {
        expect(() => Buffer.from(part, 'base64')).not.toThrow();
      });
    });
  });
});
