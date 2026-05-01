#include <stdio.h>

int main() {
  printf("1: Create contact\n");
  printf("2: Search contact\n");
  printf("3: Search user\n");
  printf("4: Delete contact\n");
  printf("5: Quit program\n");

  while (1) {
    printf("\nEnter your choice: ");

    size_t choice = 0;

    if (scanf("%zu", &choice) != 1) {
      printf("Invalid number given\n");
      while (getchar() != '\n'); 
      continue;
    }

    if (choice == 5) {
      printf("Exiting program\n");
      break;
    }

    switch (choice) {
      case 1:
        printf("You choosed to create new contact\n");
        break;

      case 2:
        printf("You choosed to search contact\n");
        break;
      
      case 3:
        printf("You choosed to search user\n");
        break;

      case 4:
        printf("You choosed to delete contact\n");
        break;
      
      default:
        printf("Invalid number given\n");
        break;
    }
  }
}