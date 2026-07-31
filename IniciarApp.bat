@echo off
echo =======================================================
echo          SERVIDOR DO DESLOCATRACK (PWA)
echo =======================================================
echo.
echo O aplicativo esta rodando na sua rede local!
echo Mantenha esta JANELA PRETA ABERTA.
echo.
echo Pegue o seu celular (conectado no mesmo Wi-Fi) e e acesse:
echo http://192.168.0.115:8000
echo.
python -m http.server 8000
pause
