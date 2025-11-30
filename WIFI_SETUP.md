# WiFi Setup for Papertrail

The Papertrail application requires elevated privileges to manage WiFi connections using NetworkManager (nmcli). This guide explains how to configure passwordless sudo for the required nmcli commands.

## Quick Setup

Run these commands on your Raspberry Pi:

```bash
# Copy the sudoers configuration file
sudo cp config/papertrail-sudoers /etc/sudoers.d/papertrail

# Set correct permissions (required for sudoers files)
sudo chmod 0440 /etc/sudoers.d/papertrail

# Verify the configuration is valid
sudo visudo -c
```

If you see "parsed OK", the configuration is valid and active.

## What This Does

The sudoers configuration allows your user (default: `pi`) to run specific nmcli commands without entering a password:

- `nmcli device wifi connect` - Connect to WiFi networks
- `nmcli device wifi rescan` - Scan for available networks
- `nmcli device disconnect` - Disconnect from WiFi
- `nmcli connection add` - Save new network configurations
- `nmcli connection delete` - Remove saved networks
- `nmcli connection modify` - Modify existing network configs

## If You Use a Different Username

If your username is not `pi`, edit the configuration file before copying:

```bash
# Edit the file and replace 'pi' with your username
nano config/papertrail-sudoers

# Then copy it
sudo cp config/papertrail-sudoers /etc/sudoers.d/papertrail
sudo chmod 0440 /etc/sudoers.d/papertrail
```

## Security Notes

- This configuration only allows specific nmcli commands, not full sudo access
- The commands are limited to WiFi management operations
- This is a standard approach for IoT devices that need network management
- The sudoers file permissions (0440) ensure it can't be modified without root

## Testing

After setup, test that WiFi commands work without password prompts:

```bash
# This should complete without asking for a password
sudo nmcli device wifi rescan
```

## Troubleshooting

### "sudo: unable to resolve host"

This is usually harmless. To fix, add your hostname to `/etc/hosts`:

```bash
echo "127.0.0.1 $(hostname)" | sudo tee -a /etc/hosts
```

### "syntax error in /etc/sudoers.d/papertrail"

Run `sudo visudo -f /etc/sudoers.d/papertrail` to check for errors.
Make sure there are no extra spaces or tabs.

### Commands still ask for password

Verify the file exists and has correct permissions:

```bash
ls -l /etc/sudoers.d/papertrail
# Should show: -r--r----- 1 root root ... papertrail
```

## Alternative: Run Papertrail as Root (Not Recommended)

If you prefer not to configure sudoers, you can run Papertrail with sudo:

```bash
sudo npm start
# or for development
sudo npm run dev
```

However, this is not recommended as it gives the entire application root privileges.
