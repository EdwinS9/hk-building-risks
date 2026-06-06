"""Model factory: ImageNet-pretrained backbone + a fresh 3-class head."""
import torch.nn as nn
from torchvision import models

from labels import CLASSES


def build_model(arch: str = "efficientnet_b0", freeze_backbone: bool = False):
    n = len(CLASSES)
    if arch == "efficientnet_b0":
        m = models.efficientnet_b0(weights=models.EfficientNet_B0_Weights.DEFAULT)
        if freeze_backbone:
            for p in m.features.parameters():
                p.requires_grad = False
        in_feats = m.classifier[1].in_features
        m.classifier[1] = nn.Linear(in_feats, n)
    elif arch == "resnet50":
        m = models.resnet50(weights=models.ResNet50_Weights.DEFAULT)
        if freeze_backbone:
            for name, p in m.named_parameters():
                if not name.startswith("fc."):
                    p.requires_grad = False
        m.fc = nn.Linear(m.fc.in_features, n)
    else:
        raise ValueError(f"unknown arch: {arch}")
    return m
