param(
  [string]$InputPath = "public\salvage-pulse-logo.jpg",
  [string]$OutputPath = "public\salvage-pulse-logo.png"
)

Add-Type -AssemblyName System.Drawing

$source = @"
using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;

public static class LogoCleaner
{
    private static bool NearBlack(byte b, byte g, byte r, int threshold)
    {
        return r <= threshold && g <= threshold && b <= threshold;
    }

    public static void Process(string inputPath, string outputPath, int threshold = 30)
    {
        using (var src = new Bitmap(inputPath))
        {
            int width = src.Width;
            int height = src.Height;
            using (var rgba = new Bitmap(width, height, PixelFormat.Format32bppArgb))
            {
                using (var graphics = Graphics.FromImage(rgba))
                {
                    graphics.DrawImage(src, 0, 0, width, height);
                }

                var data = rgba.LockBits(
                    new Rectangle(0, 0, width, height),
                    ImageLockMode.ReadWrite,
                    PixelFormat.Format32bppArgb);

                try
                {
                    int stride = data.Stride;
                    var bytes = new byte[stride * height];
                    Marshal.Copy(data.Scan0, bytes, 0, bytes.Length);

                    var visited = new bool[width * height];
                    var queue = new Queue<int>();

                    Action<int, int> seed = (x, y) =>
                    {
                        int index = y * width + x;
                        if (visited[index]) return;
                        int p = y * stride + x * 4;
                        byte b = bytes[p];
                        byte g = bytes[p + 1];
                        byte r = bytes[p + 2];
                        if (!NearBlack(b, g, r, threshold)) return;
                        visited[index] = true;
                        queue.Enqueue(index);
                    };

                    for (int x = 0; x < width; x++)
                    {
                        seed(x, 0);
                        seed(x, height - 1);
                    }
                    for (int y = 0; y < height; y++)
                    {
                        seed(0, y);
                        seed(width - 1, y);
                    }

                    while (queue.Count > 0)
                    {
                        int index = queue.Dequeue();
                        int x = index % width;
                        int y = index / width;
                        int p = y * stride + x * 4;

                        bytes[p + 3] = 0;

                        if (x > 0) Visit(x - 1, y, width, stride, bytes, visited, queue, threshold);
                        if (x < width - 1) Visit(x + 1, y, width, stride, bytes, visited, queue, threshold);
                        if (y > 0) Visit(x, y - 1, width, stride, bytes, visited, queue, threshold);
                        if (y < height - 1) Visit(x, y + 1, width, stride, bytes, visited, queue, threshold);
                    }

                    int minX = width, minY = height, maxX = -1, maxY = -1;
                    for (int y = 0; y < height; y++)
                    {
                        for (int x = 0; x < width; x++)
                        {
                            int p = y * stride + x * 4;
                            if (bytes[p + 3] == 0) continue;
                            if (x < minX) minX = x;
                            if (y < minY) minY = y;
                            if (x > maxX) maxX = x;
                            if (y > maxY) maxY = y;
                        }
                    }

                    Marshal.Copy(bytes, 0, data.Scan0, bytes.Length);
                    rgba.UnlockBits(data);
                    data = null;

                    if (maxX < minX || maxY < minY)
                    {
                        rgba.Save(outputPath, ImageFormat.Png);
                        return;
                    }

                    int padding = 6;
                    minX = Math.Max(0, minX - padding);
                    minY = Math.Max(0, minY - padding);
                    maxX = Math.Min(width - 1, maxX + padding);
                    maxY = Math.Min(height - 1, maxY + padding);

                    var bounds = new Rectangle(minX, minY, maxX - minX + 1, maxY - minY + 1);
                    using (var cropped = rgba.Clone(bounds, rgba.PixelFormat))
                    {
                        cropped.Save(outputPath, ImageFormat.Png);
                    }
                }
                finally
                {
                    if (data != null) rgba.UnlockBits(data);
                }
            }
        }
    }

    private static void Visit(
        int x,
        int y,
        int width,
        int stride,
        byte[] bytes,
        bool[] visited,
        Queue<int> queue,
        int threshold)
    {
        int index = y * width + x;
        if (visited[index]) return;

        int p = y * stride + x * 4;
        byte b = bytes[p];
        byte g = bytes[p + 1];
        byte r = bytes[p + 2];
        if (!NearBlack(b, g, r, threshold)) return;

        visited[index] = true;
        queue.Enqueue(index);
    }
}
"@

if (-not ("LogoCleaner" -as [type])) {
    Add-Type -TypeDefinition $source -ReferencedAssemblies System.Drawing
}

[LogoCleaner]::Process((Resolve-Path $InputPath).Path, (Join-Path (Get-Location) $OutputPath), 30)
Write-Output "Wrote $OutputPath"
