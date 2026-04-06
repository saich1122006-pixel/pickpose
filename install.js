import { analytics, logEvent } from './firebase-config.js';

let deferredPrompt;
const btnInstall = document.getElementById('btnStoreInstall');
const iosInstruct = document.getElementById('iosInstruct');
const btnText = document.getElementById('btnText');
const installMsg = document.getElementById('installMsg');

// Detect OS
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
const isAndroid = /Android/.test(navigator.userAgent);

// Log page view
logEvent(analytics, 'install_page_view', {
    device: isIOS ? 'ios' : (isAndroid ? 'android' : 'desktop')
});

// Handle PWA install prompt
window.addEventListener('beforeinstallprompt', (e) => {
    // Prevent Chrome 67 and earlier from automatically showing the prompt
    e.preventDefault();
    // Stash the event so it can be triggered later.
    deferredPrompt = e;
    
    // Update UI to notify the user they can install the PWA
    if (btnInstall) {
        btnInstall.style.display = 'flex';
    }
});

// If it's iOS, show instructions instead of the install button (since iOS doesn't support beforeinstallprompt)
if (isIOS) {
    if (btnInstall) btnInstall.style.display = 'none';
    if (iosInstruct) iosInstruct.classList.add('visible');
}

btnInstall?.addEventListener('click', async () => {
    if (deferredPrompt) {
        // Show the install prompt
        deferredPrompt.prompt();
        // Wait for the user to respond to the prompt
        const { outcome } = await deferredPrompt.userChoice;
        console.log(`User response to the install prompt: ${outcome}`);
        // We've used the prompt, and can't use it again, throw it away
        deferredPrompt = null;
        
        if (outcome === 'accepted') {
            logEvent(analytics, 'install_accepted_from_page');
            if (installMsg) {
                installMsg.textContent = "Installing PickPose... Check your home screen!";
                installMsg.style.display = 'block';
            }
        }
    } else if (!isIOS) {
        // Fallback for desktop or if prompt hasn't fired yet
        if (installMsg) {
            installMsg.textContent = "Please use your browser's 'Install' or 'Add to Home Screen' option.";
            installMsg.style.display = 'block';
        }
    }
});

window.addEventListener('appinstalled', (evt) => {
    console.log('PickPose was installed.');
    logEvent(analytics, 'install_completed_from_page');
    if (btnText) btnText.textContent = "App Installed!";
    if (btnInstall) btnInstall.style.background = "#34c759";
    if (installMsg) installMsg.textContent = "PickPose is now on your home screen!";
});
