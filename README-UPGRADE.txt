WIZARD ARCANA v3 — UPDATE YOUR EXISTING GITHUB REPOSITORY
==========================================================

Your GitHub repository already uses: wizard-arcana/ (subfolder)

1. Upload wizard-arcana-v3.zip to repository ROOT in GitHub.
2. Open GitHub Codespaces, from the repository root terminal run:

   unzip -o wizard-arcana-v3.zip
   git add -A
   git commit -m "Upgrade Wizard Arcana to v3"
   git push origin main

3. In Render use Root Directory: wizard-arcana  (NO leading slash)
   Build Command: npm install
   Start Command: npm start

4. Existing Render web service should redeploy automatically if auto-deploy is on.

IMPORTANT: unzip -o means overwrite the old version inside wizard-arcana/.
Do NOT unzip from inside the wizard-arcana/ folder, or you will make a nested folder.

See wizard-arcana/README.md for full details, offline and reconnection behavior.

This is a personal fan-made adaptation. It includes card art from a user-supplied photo.
Public redistribution of the original artwork may require permission from rights owners.
