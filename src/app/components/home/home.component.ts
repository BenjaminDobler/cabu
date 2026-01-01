import { Component } from '@angular/core';
import { Router } from '@angular/router';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [],
  templateUrl: './home.component.html',
  styleUrl: './home.component.scss'
})
export class HomeComponent {
  constructor(private router: Router) {}

  hostGame(): void {
    this.router.navigate(['/host']);
  }

  joinGame(): void {
    this.router.navigate(['/join']);
  }
}
