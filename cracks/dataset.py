"""Torch Dataset + transforms for the crack manifest."""
from pathlib import Path

import pandas as pd
import torch
from PIL import Image
from torch.utils.data import Dataset
from torchvision import transforms

from labels import CLASS_TO_IDX

IMG_SIZE = 224
# ImageNet normalisation (we use ImageNet-pretrained backbones).
_MEAN = [0.485, 0.456, 0.406]
_STD = [0.229, 0.224, 0.225]


def build_transforms(train: bool):
    if train:
        return transforms.Compose([
            transforms.Resize((IMG_SIZE, IMG_SIZE)),
            transforms.RandomHorizontalFlip(),
            transforms.RandomVerticalFlip(),
            transforms.RandomRotation(20),
            transforms.ColorJitter(0.2, 0.2, 0.2),
            transforms.ToTensor(),
            transforms.Normalize(_MEAN, _STD),
        ])
    return transforms.Compose([
        transforms.Resize((IMG_SIZE, IMG_SIZE)),
        transforms.ToTensor(),
        transforms.Normalize(_MEAN, _STD),
    ])


def _rows_for_domain(manifest, domain, split):
    """Rows a specialist sees: its own domain plus the shared 'other' class."""
    df = pd.read_csv(manifest)
    df = df[(df.split == split) & (df.domain.isin([domain, "other"]))]
    return df.reset_index(drop=True)


class CrackDataset(Dataset):
    def __init__(self, manifest: str | Path, domain: str, split: str,
                 train_aug: bool):
        self.df = _rows_for_domain(manifest, domain, split)
        self.tf = build_transforms(train_aug)

    def __len__(self):
        return len(self.df)

    def __getitem__(self, i):
        row = self.df.iloc[i]
        img = Image.open(row.path).convert("RGB")
        x = self.tf(img)
        y = CLASS_TO_IDX[row.label]
        return x, y

    def labels(self):
        return self.df.label.map(CLASS_TO_IDX).to_numpy()


def class_weights(manifest: str | Path, domain: str,
                  split: str = "train") -> torch.Tensor:
    """Inverse-frequency weights for class-balanced cross-entropy (per domain)."""
    df = _rows_for_domain(manifest, domain, split)
    counts = df.label.value_counts().to_dict()
    from labels import CLASSES
    freqs = torch.tensor([counts.get(c, 0) for c in CLASSES], dtype=torch.float)
    w = freqs.sum() / (len(CLASSES) * freqs.clamp(min=1))
    return w
