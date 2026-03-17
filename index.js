"use strict";

import { drawText } from "https://cdn.jsdelivr.net/npm/canvas-txt@4.1.1/+esm";
import { printCanvas } from "./src/printer.js";

const $ = document.querySelector.bind(document);
const $all = document.querySelectorAll.bind(document);

const labelSize = { width: 40, height: 12 };

const updateLabelSize = (canvas) => {
	const inputWidth = $("#inputWidth").valueAsNumber;
	const inputHeight = $("#inputHeight").valueAsNumber;
	if (isNaN(inputWidth) || isNaN(inputHeight)) {
		handleError("label size invalid");
		return;
	}

	labelSize.width = inputWidth;
	labelSize.height = inputHeight;

	// Image sent to printer is printed top to bottom, so reverse width and height
	canvas.width = labelSize.height * 8;
	canvas.height = labelSize.width * 8;
};

const updateCanvasText = (canvas) => {
	const text = $("#inputText").value;
	const fontSize = $("#inputFontSize").valueAsNumber;
	if (isNaN(fontSize)) {
		handleError("font size invalid");
		return;
	}

	const ctx = canvas.getContext("2d");
	ctx.fillStyle = "#fff";
	ctx.fillRect(0, 0, canvas.width, canvas.height);

	ctx.translate(canvas.width / 2, canvas.height / 2);
	ctx.rotate(Math.PI / 2);

	ctx.fillStyle = "#000";
	ctx.textAlign = "center";
	ctx.textBaseline = "top";
	drawText(ctx, text, {
		x: -canvas.height / 2,
		y: -canvas.width / 2,
		width: canvas.height,
		height: canvas.width,
		font: "sans-serif",
		fontSize,
	});

	ctx.rotate(-Math.PI / 2);
	ctx.translate(-canvas.width / 2, -canvas.height / 2);
};

const updateCanvasBarcode = (canvas) => {
	const barcodeData = $("#inputBarcode").value;
	const image = document.createElement("img");
	image.addEventListener("load", () => {
		const ctx = canvas.getContext("2d");
		ctx.fillStyle = "#fff";
		ctx.fillRect(0, 0, canvas.width, canvas.height);

		ctx.translate(canvas.width / 2, canvas.height / 2);
		ctx.rotate(Math.PI / 2);

		ctx.imageSmoothingEnabled = false;
		ctx.drawImage(image, -image.width / 2, -image.height / 2);

		ctx.rotate(-Math.PI / 2);
		ctx.translate(-canvas.width / 2, -canvas.height / 2);
	});

	JsBarcode(image, barcodeData, {
		format: "CODE128",
		width: 2,
		height: labelSize.height * 7,
		displayValue: false,
	});
};

const drawImageToCanvas = (ctx, url, doScale = true) => {
	const img = new Image();
	img.addEventListener("load", () => {
		ctx.fillStyle = "#fff";
		ctx.fillRect(0, 0, canvas.width, canvas.height);

		ctx.translate(canvas.width / 2, canvas.height / 2);
		ctx.rotate(Math.PI / 2);

		ctx.imageSmoothingEnabled = false;
		// draw image in center of canvas, scaled to fit
		const scale = doScale ? Math.min(canvas.height / img.width, canvas.width / img.height) : 1;
		const drawWidth = img.width * scale;
		const drawHeight = img.height * scale;
		ctx.drawImage(img, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight);

		ctx.rotate(-Math.PI / 2);
		ctx.translate(-canvas.width / 2, -canvas.height / 2);
	});
	img.addEventListener("error", () => {
		handleError("failed to load image");
	});

	img.src = url;
};

const updateCanvasImage = (canvas) => {
	const ctx = canvas.getContext("2d");
	const file = $("#inputImage").files[0];
	if (!file) {
		ctx.fillStyle = "#fff";
		ctx.fillRect(0, 0, canvas.width, canvas.height);
		return;
	}

	const reader = new FileReader();
	reader.addEventListener("load", (e) => {
		drawImageToCanvas(ctx, e.target.result);
	});
	reader.addEventListener("error", () => {
		handleError("failed to read image file");
	});

	reader.readAsDataURL(file);
};

const updateCanvasQR = async (canvas) => {
	const data = $("#inputQR").value;
	const ctx = canvas.getContext("2d");
	const qrImg = await QRCode.toDataURL(data, { width: canvas.width - 8, margin: 2 });
	drawImageToCanvas(ctx, qrImg, false);
};

const handleError = (err) => {
	console.error(err);

	const toast = bootstrap.Toast.getOrCreateInstance($("#errorToast"));
	$("#errorText").textContent = err.toString();
	toast.show();
};

document.addEventListener("DOMContentLoaded", function () {
	const canvas = document.querySelector("#canvas");

	document.addEventListener("shown.bs.tab", (e) => {
		if (e.target.id === "nav-text-tab") updateCanvasText(canvas);
		else if (e.target.id === "nav-barcode-tab") updateCanvasBarcode(canvas);
		else if (e.target.id === "nav-image-tab") updateCanvasImage(canvas);
		else if (e.target.id === "nav-qr-tab") updateCanvasQR(canvas);
	});

	$all("#inputWidth, #inputHeight").forEach((e) =>
		e.addEventListener("input", () => updateLabelSize(canvas))
	);
	updateLabelSize(canvas);

	$all("#inputText, #inputFontSize").forEach((e) =>
		e.addEventListener("input", () => updateCanvasText(canvas))
	);
	updateCanvasText(canvas);

	$("#inputBarcode").addEventListener("input", () => updateCanvasBarcode(canvas));
	$("#inputImage").addEventListener("change", () => updateCanvasImage(canvas));
	$("#inputQR").addEventListener("input", () => updateCanvasQR(canvas));

	// Cache the paired device so subsequent prints reconnect silently without
	// showing the device picker again.
	let cachedDevice = null;
	let cachedChar = null;

	const SERVICE_UUID = "0000ff00-0000-1000-8000-00805f9b34fb";
	const CHAR_UUID = "0000ff02-0000-1000-8000-00805f9b34fb";

	const getCharacteristic = async () => {
		// Reuse existing connection if still live
		if (cachedChar && cachedDevice?.gatt?.connected) {
			return cachedChar;
		}

		// Device known but disconnected — try silent reconnect first
		if (cachedDevice) {
			try {
				const server = await cachedDevice.gatt.connect();
				const service = await server.getPrimaryService(SERVICE_UUID);
				cachedChar = await service.getCharacteristic(CHAR_UUID);
				return cachedChar;
			} catch {
				// Silent reconnect failed; fall through to show picker again
				cachedDevice = null;
				cachedChar = null;
			}
		}

		// No device yet (or reconnect failed) — show the browser device picker
		const device = await navigator.bluetooth.requestDevice({
			acceptAllDevices: true,
			optionalServices: [SERVICE_UUID],
		});

		// When the device disconnects, clear the characteristic so the next
		// print attempt triggers a silent reconnect rather than failing silently.
		device.addEventListener("gattserverdisconnected", () => {
			cachedChar = null;
		});

		cachedDevice = device;
		const server = await device.gatt.connect();
		const service = await server.getPrimaryService(SERVICE_UUID);
		cachedChar = await service.getCharacteristic(CHAR_UUID);
		return cachedChar;
	};

	$("form").addEventListener("submit", async (e) => {
		e.preventDefault();
		try {
			const char = await getCharacteristic();
			await printCanvas(char, canvas);
		} catch (err) {
			handleError(err);
		}
	});
});
